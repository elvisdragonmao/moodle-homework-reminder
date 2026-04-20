import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOUR_MS = 60 * 60 * 1000;
const RUNNER_PATH = fileURLToPath(new URL("./runner.js", import.meta.url));

let isRunning = false;

async function runRunner() {
	if (isRunning) {
		console.warn("Skipping run because runner.js is still running.");
		return;
	}

	isRunning = true;

	try {
		const child = spawn(process.execPath, [RUNNER_PATH], {
			env: process.env,
			stdio: "inherit"
		});

		const { code, signal } = await new Promise((resolve, reject) => {
			child.once("error", reject);
			child.once("close", (exitCode, exitSignal) => {
				resolve({ code: exitCode, signal: exitSignal });
			});
		});

		if (code !== 0) {
			console.error(`runner.js exited with ${signal ? `signal ${signal}` : `code ${code}`}`);
		}
	} catch (err) {
		console.error(err);
	} finally {
		isRunning = false;
	}
}

await runRunner();

setInterval(() => {
	void runRunner();
}, HOUR_MS);
