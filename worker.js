import { runReminder } from "./reminder.js";

async function handleRun(env) {
	const summary = await runReminder(env);
	console.log(JSON.stringify(summary));
	return summary;
}

export default {
	async scheduled(_controller, env, ctx) {
		ctx.waitUntil(handleRun(env));
	},

	async fetch(_request, env) {
		try {
			const summary = await handleRun(env);
			return Response.json({ ok: true, summary });
		} catch (error) {
			console.error(error);
			return Response.json(
				{
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				},
				{ status: 500 }
			);
		}
	}
};
