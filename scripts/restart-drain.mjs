import process from 'node:process';

const command = process.argv[2] ?? 'status';
const controlUrl =
	process.env.RESTART_CONTROL_URL ||
	`http://127.0.0.1:${process.env.PORT || '3000'}/api/admin/runtime/restart`;
const bearerToken = process.env.DEPLOY_CONTROL_TOKEN || process.env.SESSION_SECRET || '';
const timeoutSeconds = Number(process.env.SAFE_RESTART_TIMEOUT_SECONDS || '300');
const pollIntervalSeconds = Number(process.env.SAFE_RESTART_POLL_INTERVAL_SECONDS || '2');

if (!bearerToken) {
	console.error('[restart-drain] Missing DEPLOY_CONTROL_TOKEN or SESSION_SECRET.');
	process.exit(1);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(method, body) {
	const response = await fetch(controlUrl, {
		method,
		headers: {
			Authorization: `Bearer ${bearerToken}`,
			...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});

	const text = await response.text();
	let payload = null;
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = { raw: text };
		}
	}

	if (!response.ok) {
		const message =
			payload && typeof payload === 'object' && 'error' in payload
				? String(payload.error)
				: `Restart drain request failed with status ${response.status}`;
		throw new Error(message);
	}

	return payload;
}

function summarizeState(state) {
	const activeCount = Number(state?.activeCount ?? 0);
	const draining = state?.draining === true;
	const operations = Array.isArray(state?.operations) ? state.operations : [];
	const operationSummary =
		operations.length > 0
			? operations
					.map((operation) => {
						const mode = typeof operation.mode === 'string' ? operation.mode : 'chat';
						const phase = typeof operation.phase === 'string' ? operation.phase : 'unknown';
						const conversationId =
							typeof operation.conversationId === 'string'
								? operation.conversationId
								: 'unknown-conversation';
						return `${mode}:${phase}:${conversationId}`;
					})
					.join(', ')
			: 'none';

	return {
		activeCount,
		draining,
		operationSummary,
	};
}

async function run() {
	if (command === 'start') {
		const state = await request('POST', { reason: 'deploy' });
		const summary = summarizeState(state);
		console.log(
			`[restart-drain] Drain active. ${summary.activeCount} active turn(s): ${summary.operationSummary}`
		);
		return;
	}

	if (command === 'clear') {
		await request('DELETE');
		console.log('[restart-drain] Drain cleared.');
		return;
	}

	if (command === 'status') {
		const state = await request('GET');
		const summary = summarizeState(state);
		console.log(
			`[restart-drain] draining=${summary.draining} active=${summary.activeCount} operations=${summary.operationSummary}`
		);
		return;
	}

	if (command === 'wait') {
		const deadline = Date.now() + timeoutSeconds * 1000;

		while (Date.now() < deadline) {
			const state = await request('GET');
			const summary = summarizeState(state);

			if (summary.activeCount === 0) {
				console.log('[restart-drain] Safe restart window reached.');
				return;
			}

			console.log(
				`[restart-drain] Waiting for ${summary.activeCount} active turn(s): ${summary.operationSummary}`
			);
			await sleep(Math.max(250, pollIntervalSeconds * 1000));
		}

		throw new Error(
			`Timed out waiting for a safe restart window after ${timeoutSeconds} seconds.`
		);
	}

	throw new Error(
		`Unknown command "${command}". Use one of: start, wait, clear, status.`
	);
}

run().catch((error) => {
	console.error(
		`[restart-drain] ${error instanceof Error ? error.message : String(error)}`
	);
	process.exit(1);
});
