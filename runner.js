import "dotenv/config";
import fs from "node:fs/promises";

import { runReminder } from "./reminder.js";

const STATE_FILE = process.env.STATE_FILE || "./state.json";

async function loadState() {
	try {
		return JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
	} catch {
		return { sent: {} };
	}
}

async function saveState(state) {
	await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

runReminder(process.env, {
	loadState,
	saveState
}).catch(err => {
	console.error(err);
	process.exit(1);
});
