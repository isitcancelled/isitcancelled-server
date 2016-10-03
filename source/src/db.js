import moment from 'moment';
import bluebird from 'bluebird';
import redis from 'redis';
import _ from 'lodash';

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const DATE_MAX = new Date(8640000000000000);
const DATE_MIN = new Date(-8640000000000000);

export default class DatabaseClient {
	constructor(...args) {
		this.redisClient = redis.createClient(...args);
	}
	async set(path, data, nextUpdate) {
		const transaction = this.redisClient.multi();
		transaction.set(path.join(':'), JSON.stringify(data));
		if(moment.isDuration(nextUpdate))
			transaction.hset('meta:next_updates', path.join(':'), moment().add(nextUpdate).toISOString());
		if(moment.isMoment(nextUpdate) || moment.isDate(nextUpdate))
			transaction.hset('meta:next_updates', path.join(':'), nextUpdate.toISOString());
		await transaction.execAsync();
	}
	async get(path) {
		return JSON.parse(await this.redisClient.getAsync(path.join(':')));
	}
	async setUpdatePool(paths) {
		let joinedPaths = paths.map((x) => x.join(':'));
		for(;;) {
			await this.redisClient.watchAsync('meta:next_updates');
			const nextUpdates = await this.redisClient.hgetallAsync('meta:next_updates');
			const addedPaths = _.difference(joinedPaths, _.keys(nextUpdates));
			const removedPaths = _.difference(_.keys(nextUpdates), joinedPaths);
			const transaction = this.redisClient.multi();
			transaction.hmset('meta:next_updates', addedPaths.map((x) => [x, DATE_MIN.toISOString()]).reduce((y, x) => (y.concat(x)), []));
			if(removedPaths.length !== 0)
				transaction.hdel('meta:next_updates', ...removedPaths);
			
			const res = await transaction.execAsync();
			if (res !== null)
				break;
		}
	}
	async delete(path) {
		const transaction = this.redisClient.multi();
		transaction.del(path.join(':'));
		transaction.hdel('meta:next_updates', path.join(':'));
		await transaction.execAsync();
	}
	async getNext() {
		let currentNextUpdate = DATE_MAX;
		let currentKey = null;
		const data = await this.redisClient.hgetallAsync('meta:next_updates');
		for(let key in data) {
			if(!data.hasOwnProperty(key)) continue;
			let nextUpdate = new Date(data[key]);
			if(currentNextUpdate > nextUpdate) {
				currentNextUpdate = nextUpdate;
				currentKey = key;
			}
		}
		return currentKey.split(':');
	}
	async flush() {
		await this.redisClient.flushdbAsync();
	}
}