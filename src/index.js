import build from 'pino-abstract-transport';

/**
 * @typedef {object} Options
 * @property {string} apiKey
 */

/**
 * @param {Options} options
 * @returns {import('node:stream').Writable}
 */
export default function createTransport(options) {
	/** @type {?string} */
	let buffer;
	/** @type {?NodeJS.Timeout} */
	let timeout;

	return build(
		async (source) => {
			for await (const obj of source) {
				if (!buffer) {
					buffer = transform(obj);
				} else {
					buffer += '\n' + transform(obj);
				}

				if (!timeout) {
					timeout = setTimeout(flush, 1000);
				}
			}
		},
		{ close: flush },
	);

	async function flush() {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = null;

		if (buffer) {
			const data = buffer;
			buffer = null;
			await sendLogs(data);
		}
	}

	/** @param {string} data */
	async function sendLogs(data, retry = true) {
		await fetch(
			`https://appsignal-endpoint.net/logs/json?api_key=${options.apiKey}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/x-ndjson' },
				body: data,
			},
		).catch((error) => {
			console.error('Failed to send logs to AppSignal', error);
			if (retry) {
				return sendLogs(data, false);
			}
		});
	}
}

/** @param {any} obj */
function transform(obj) {
	const { time, group, hostname, pid, level, msg, ...attributes } = obj;

	return JSON.stringify({
		timestamp: new Date(time).toISOString(),
		severity: getSeverity(level),
		hostname,
		group,
		message: msg,
		attributes,
	});
}

/** @param {number} level */
function getSeverity(level) {
	if (level >= 50) return 'error';
	if (level >= 40) return 'warning';
	if (level >= 30) return 'info';
	if (level >= 20) return 'debug';
	return 'trace';
}
