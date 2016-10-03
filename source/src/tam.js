import vm, { Script } from 'vm';
import request from 'request-promise';
import cookie from 'cookie';
import cheerio from 'cheerio';
import moment from 'moment-timezone';
import { autobind } from 'core-decorators';
import http from 'http';

const TAM_TIMEZONE = 'Europe/Zurich';

@autobind
export default class TAMClient {
	constructor(school, user, password) {
		this.school = school;
		this.user = user;
		this.password = password;
	}
	
	async _getSession() {
		let response = await request.post('https://intranet.tam.ch/', {
			headers: {
				'User-Agent': 'IsItCancelled/3.0 (+https://isitcancelled.ch/)',
			},
			form: {
				loginschool: this.school,
				loginuser: this.user,
				loginpassword: this.password
			},
			forever: true,
			resolveWithFullResponse: true,
			simple: false
		});

		let rawCookies = response.headers['set-cookie'];
		let parsedCookies = rawCookies.map(cookie.parse);
		return parsedCookies[0].sturmsession;
	}

	async _makeRequest(options) {
		for(let i = 0; i < 3; i++) {
			let headers = {
				Cookie: cookie.serialize('sturmsession', this._sessionId) + "; " + cookie.serialize('sturmuser', this.user),
				'User-Agent': 'IsItCancelled/3.0 (+https://isitcancelled.ch/)',
				forever: true,
				...(options.headers || {})
			};

			let response = await request({
				resolveWithFullResponse: true,
				simple: false,
				...options,
				headers: headers
			});

			if(response.body.indexOf('Login.init(null);') > -1) {
				this._sessionId = await this._getSession();
				continue;
			}
			return response.body;
		}
		throw new Error("Failed to get a valid session");
	}

	async getMetadata() {
		let response = await this._makeRequest({ method: 'GET', url: 'https://intranet.tam.ch/krm/calendar' });
		let doc = cheerio.load(response);
		let code = doc("script:contains('ttAdministration.init();')").text();

		let sandbox = {
			// Mock environment
			ttAdministration: {},
			$: () => ({ ready: () => null }),
			document: null
		};

		let context = vm.createContext(sandbox);
		let script = new Script(code);
		script.runInContext(context);
		return new TAMMetadata(context.ttAdministration);
	}

	async getClasses(semesterId) {
		let response = await this._makeRequest({
			url: `https://intranet.tam.ch/${this.school}/timetable/ajax-get-resources/period/${semesterId}`,
			method: 'POST',
			headers: {
				'X-Requested-With': 'XMLHttpRequest'
			},
			form: {}
		});

		let data = JSON.parse(response);
		let classes = data.data.classes;
		return classes.map(_class => ({
			id: _class.classId,
			name: _class.className
		}));
	}

	async getLessons(startDate, endDate, classId) {
		let request = {
			startDate: moment(startDate).valueOf(),
			endDate: moment(endDate).valueOf(),
			'classId[]': classId,
			holidaysOnly: 0
		};
		let response = await this._makeRequest({
			url: `https://intranet.tam.ch/${this.school}/timetable/ajax-get-timetable`,
			method: 'POST',
			headers: {
				'X-Requested-With': 'XMLHttpRequest'
			},
			form: request
		});
		let { data } = JSON.parse(response);
		return data.map(this._parseLessons);
	}

	_parseLessons(lessonData) {
		let statusMap = {
			cancel: 'cancelled',
			lesson: 'normal'
		};
		let entryMap = {
			'rmchg': 'ROOM_CHANGED',
		}
		return {
			name: lessonData.title,
			fullName: lessonData.subjectName,
			room: lessonData.roomName,
			startDate: moment.tz(lessonData.lessonDate + " " + lessonData.lessonStart, 'YYYY-MM-DD HH:mm:ss', TAM_TIMEZONE).toDate(),
			endDate: moment.tz(lessonData.lessonDate + " " + lessonData.lessonEnd, 'YYYY-MM-DD HH:mm:ss', TAM_TIMEZONE).toDate(),
			teacher: lessonData.teacherAcronym,
			status: statusMap[lessonData.timetableEntryTypeShort],
			comment: lessonData.message
		};
	}
}

@autobind
class TAMMetadata {
	constructor(data) {
		this.data = data;
	}
	getSemesters() {
		return this.data.period.map(period => ({
			id: period.periodId,
			name: period.period,
			startDate: moment.tz(period.startDate, 'YYYY-MM-DD HH:mm:ss', TAM_TIMEZONE).toDate(),
			endDate: moment.tz(period.endDate, 'YYYY-MM-DD HH:mm:ss', TAM_TIMEZONE).toDate()
		}));
	}
	getWeeks(semesterId) {
		const rawSemester = this.data.period.filter(period => period.periodId == semesterId)[0];

		const normalizedStartDate = moment.tz(rawSemester.startDate, 'YYYY-MM-DD HH:mm:ss', TAM_TIMEZONE).day(1);
		const normalizedEndDate = moment.tz(rawSemester.endDate, 'YYYY-MM-DD HH:mm:ss', TAM_TIMEZONE).day(6);

		const weeks = [];
		let count = 0;
		while(normalizedStartDate.valueOf() < normalizedEndDate.valueOf()) {
			normalizedStartDate.add(7, 'days');
			weeks.push({
				id: count++,
				startDate: normalizedStartDate.clone().toDate(),
				endDate: normalizedStartDate.clone().day(5).toDate()
			});
		}

		return weeks;
	}
	getTimeSlots() {
		return this.timegrid;
	}
}

export class TAMUtils {
	static slotLessons(timeSlots, lessons) {
		const momentTimeSlots = timeSlots.map(timeSlot => ({
			start: moment.tz(timeSlot.start, 'HH:mm', TAM_TIMEZONE),
			end: moment.tz(timeSlot.start, 'HH:mm', TAM_TIMEZONE)
		}));
		let res = [];
		for(let i = 0; i < 5; i++) {
			res[i] = [];
			timeSlots.forEach((_, j) => res[i][j] = []);
		}
		lessons.forEach(lesson => {
			const slot = TAMUtils._getLessonSlot(momentTimeSlots, lesson);
			res[slot[0], slot[1], slot[2]].push(lesson);
		});
	}
	static _getLessonSlot(timeSlots, lesson) {
		timeSlots.filter(timeSlot => lesson.startDate.hour() == timeSlot.start.hour() && lesson.startDate.minute() == timeSlot.start.minute())
	}
}