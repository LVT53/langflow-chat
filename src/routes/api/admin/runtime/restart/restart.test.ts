import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DELETE, GET, POST } from './+server';
import { resetRestartGuardForTests } from '$lib/server/utils/restart-guard';

function makeEvent(method: string, body?: unknown) {
	return {
		request: new Request('http://localhost/api/admin/runtime/restart', {
			method,
			headers: {
				Authorization: 'Bearer deploy-test-token',
				...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
		locals: {},
		params: {},
		url: new URL('http://localhost/api/admin/runtime/restart'),
		route: { id: '/api/admin/runtime/restart' },
	} as any;
}

describe('/api/admin/runtime/restart', () => {
	const previousDeployControlToken = process.env.DEPLOY_CONTROL_TOKEN;

	beforeEach(() => {
		process.env.DEPLOY_CONTROL_TOKEN = 'deploy-test-token';
		resetRestartGuardForTests();
	});

	afterEach(() => {
		resetRestartGuardForTests();
		if (previousDeployControlToken === undefined) {
			delete process.env.DEPLOY_CONTROL_TOKEN;
		} else {
			process.env.DEPLOY_CONTROL_TOKEN = previousDeployControlToken;
		}
	});

	it('activates and clears restart drain with a bearer token', async () => {
		const postResponse = await POST(makeEvent('POST', { reason: 'deploy' }));
		const postData = await postResponse.json();

		expect(postResponse.status).toBe(200);
		expect(postData.draining).toBe(true);
		expect(postData.drainReason).toBe('deploy');

		const getResponse = await GET(makeEvent('GET'));
		const getData = await getResponse.json();

		expect(getResponse.status).toBe(200);
		expect(getData.draining).toBe(true);
		expect(getData.activeCount).toBe(0);

		const deleteResponse = await DELETE(makeEvent('DELETE'));
		const deleteData = await deleteResponse.json();

		expect(deleteResponse.status).toBe(200);
		expect(deleteData.draining).toBe(false);
	});
});
