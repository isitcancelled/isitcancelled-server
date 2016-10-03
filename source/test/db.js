import { expect } from 'chai';
import DBClient from '../src/db.js';

describe('DB Module', () => {
	let dbClient = new DBClient({
		host: process.env.CI_SERVER ? 'redis' : 'localhost',
		port: 6379
	});
	beforeEach(async function () {
		await dbClient.flush();
	});
	it('should successfully set a value and read it back again', async function () {
		const originalValue = { test: 'a' };
		await dbClient.set(['a', 'b'], originalValue, new Date());
		let value = await dbClient.get(['a', 'b']);
		expect(value).to.deep.equal(originalValue);
	});
	it('should get the item with the lowest lastUpdate', async function () {
		const originalValues = [
			{ path: ['key2017'], lastUpdate: new Date('01-01-2017')},
			{ path: ['key2015'], lastUpdate: new Date('01-01-2015')},
			{ path: ['key2016'], lastUpdate: new Date('01-01-2016')}
		];
		for (let i = 0; i < originalValues.length; i++) {
			await dbClient.set(originalValues[i].path, 'sampleValue', originalValues[i].lastUpdate);
		}

		const result = await dbClient.getNext();
		expect(result).to.deep.equal(['key2015']);
	});
	it('should return null when there is no key at the path', async function () {
		const res = await dbClient.get(['this', 'doesnt', 'exist']);
		expect(res).to.be.null;
	});
	it('should correctly set current update pool', async function () {
		await dbClient.set(['test1'], {}, new Date(1000));
		await dbClient.set(['test2'], {}, new Date(2000));
		await dbClient.setUpdatePool([['test2'], ['test3']]);
		const nextUpdate1 = await dbClient.getNext();
		expect(nextUpdate1).to.deep.equal(['test3']);
		await dbClient.set(['test3'], {}, new Date(3000));
		const nextUpdate2 = await dbClient.getNext();
		expect(nextUpdate2).to.deep.equal(['test2']);
		await dbClient.set(['test2'], {}, new Date(4000));
		const nextUpdate3 = await dbClient.getNext();
		expect(nextUpdate3).to.deep.equal(['test3']);
	});
});