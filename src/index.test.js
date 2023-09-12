import { after, test } from 'node:test';
import { MockAgent, setGlobalDispatcher } from 'undici';

import createTransport from './index.js';
import assert from 'node:assert';

const realSetTimeout = setTimeout;
const flushPromises = () => new Promise((resolve) => realSetTimeout(resolve));

const mockAgent = new MockAgent({ connections: 1 });
mockAgent.disableNetConnect();
setGlobalDispatcher(mockAgent);

after(() => {
	mockAgent.assertNoPendingInterceptors();
});

const mockPool = mockAgent.get('https://appsignal-endpoint.net');

test('does not crash if HTTP fetch fails', async (t) => {
	mockPool
		.intercept({
			path: '/logs/json?api_key=key',
			method: 'POST',
		})
		.replyWithError(new Error('error'))
		.times(2);

	t.mock.timers.enable();

	const transport = createTransport({ apiKey: 'key' });
	transport.write(
		'{"msg": "message", "time": 1617955768092, "pid": 123, "hostname": "host"}\n',
	);

	const consoleErrorMock = t.mock.method(console, 'error');

	// make sure messages are handled
	await flushPromises();

	// advance timers
	t.mock.timers.tick(1_000);

	// wait for fetch promises
	await flushPromises();

	transport.end();

	// make sure any promises created after stream ending are flushed
	await flushPromises();

	const errors = consoleErrorMock.mock.calls.filter(
		(call) => call.arguments[0].indexOf('ExperimentalWarning') === -1,
	);
	assert.equal(errors.length, 2);
});
