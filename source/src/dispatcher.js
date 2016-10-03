import 'source-map-support/register';
import bunyan from 'bunyan';
import moment from 'moment-timezone';
import TAMClient from './tam';
import DatabaseClient from './db';

const tamClient = new TAMClient(process.env.TAM_SCHOOL, process.env.TAM_USER, process.env.TAM_PASSWORD);
const databaseClient = new DatabaseClient({ port: process.env.REDIS_PORT, host: process.env.REDIS_HOST || 'redis' });

const streams = [{ level: 'info', stream: process.stdout }];
if(process.env.NODE_ENV === 'production')
	streams.push({ level: 'info', path: '/logs/source.log' });
const log = bunyan.createLogger({ name: 'isitcancelled-source', streams });

process.on('uncaughtException', (err) => {
	log.error(err, 'Application crashed');
	process.exit(1);
});

let meta = {};

const REQUEST_RATE = 1/30;

async function updateMeta() {
	const metadata = await tamClient.getMetadata();
	const semesters = metadata.getSemesters();
	const timeSlots = metadata.getTimeSlots();

	const classes = await tamClient.getClasses(semesters[1].id);
	const weeks = metadata.getWeeks(semesters[1].id);
	meta = {
		classes,
		semesters,
		timeSlots,
		weeks
	};
	
	await databaseClient.set(['meta'], meta, moment.duration(24, 'hours'));

	const updatePool = [['meta']];
	weeks.forEach(week => {
		classes.forEach(_class => {
			updatePool.push(['semesters', semesters[1].id, 'weeks', week.id, 'classes', _class.id]);
		});
	});

	await databaseClient.setUpdatePool(updatePool);
}

async function updateTimetable(semester, week, _class) {
	let currentWeekIndex = 0;
	const currentDate = moment().toDate();
	while(currentDate < meta.weeks[currentWeekIndex].endDate || currentWeekIndex >= meta.weeks.length) currentWeekIndex++;
	const lessons = await tamClient.getLessons(meta.weeks[week].startDate, meta.weeks[week].endDate, _class);

	const baseDelay = 30;
	let nextUpdate = baseDelay + baseDelay * (week - currentWeekIndex);
	if(nextUpdate <= 0) nextUpdate = 2*60*24;
	await databaseClient.set(['semesters', semester, 'weeks', week, 'classes', _class], lessons, moment.duration(nextUpdate, 'minutes'));
}

async function update(path) {
	if(path[0] === 'meta') {
		await updateMeta();
		log.info({ event: 'update', successful: true, type: 'meta' }, 'Update succeeded');
	}

	if(path[0] == 'semesters') {
		await updateTimetable(path[1], path[3], path[5]);
		log.info({
			event: 'update',
			successful: true,
			type: 'lessons',
			semester: path[1],
			week: path[3],
			class: path[5]
		}, 'Update succeeded');
	}
}

async function doWork() {
	try {
		let path = await databaseClient.getNext();
		await update(path);
	} catch (error) {
		log.warn(error, 'Update failed');
	}
}

async function init() {
	log.info('Starting IsItCancelled Source');
	meta = await databaseClient.get(['meta']);
	if(meta === null)
		await updateMeta();

	setInterval(doWork, Math.round(1000/REQUEST_RATE));
}

init();