function getConfig(rawEnv) {
	const requiredKeys = ["MOODLE_BASE_URL", "USERNAME", "PASSWORD", "NTFY_TOPIC_URL"];
	const missingKeys = requiredKeys.filter(key => !rawEnv[key]);

	const config = {
		baseUrl: rawEnv.MOODLE_BASE_URL,
		username: rawEnv.USERNAME,
		password: rawEnv.PASSWORD,
		ntfyTopicUrl: rawEnv.NTFY_TOPIC_URL,
		days: Number(rawEnv.DAYS) || 1
	};

	if (missingKeys.length > 0) {
		throw new Error(`Missing environment variables: ${missingKeys.join(", ")}`);
	}

	return config;
}

function moodleUrl(baseUrl, path) {
	return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

function sentKey(assignId, hourBucket) {
	return `${assignId}:${hourBucket}`;
}

function getHourBucket(date = new Date()) {
	const d = new Date(date);
	d.setMinutes(0, 0, 0);
	return d.toISOString();
}

function isWithinDays(duedateSec, days) {
	const now = Date.now();
	const due = duedateSec * 1000;
	return due > now && due - now <= 24 * 60 * 60 * 1000 * days;
}

function formatDue(tsSec) {
	return new Date(tsSec * 1000).toLocaleString("zh-TW", {
		hour12: false
	});
}

function remainingText(tsSec) {
	const ms = tsSec * 1000 - Date.now();
	const hours = Math.floor(ms / 3600000);
	const mins = Math.floor((ms % 3600000) / 60000);
	return `${hours}h ${mins}min`;
}

function isActuallySubmitted(statusResp) {
	return statusResp?.lastattempt?.submission?.status === "submitted";
}

function encodeBase64Utf8(str) {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(str, "utf8").toString("base64");
	}

	let binary = "";
	for (const byte of new TextEncoder().encode(str)) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

function encodeRFC2047(str) {
	return `=?UTF-8?B?${encodeBase64Utf8(str)}?=`;
}

function normalizeState(state) {
	return state && typeof state === "object" && state.sent && typeof state.sent === "object" ? state : { sent: {} };
}

export async function runReminder(rawEnv, options = {}) {
	const config = getConfig(rawEnv);
	const state = normalizeState((await options.loadState?.()) || undefined);
	const summary = {
		totalAssignments: 0,
		dueSoonAssignments: 0,
		skippedAlreadySent: 0,
		skippedSubmitted: 0,
		notified: 0
	};

	let tokenPromise;

	async function getToken() {
		if (!tokenPromise) {
			tokenPromise = (async () => {
				const url = moodleUrl(config.baseUrl, "login/token.php");
				url.search = new URLSearchParams({
					username: config.username,
					password: config.password,
					service: "moodle_mobile_app"
				}).toString();

				const res = await fetch(url);
				const json = await res.json();

				if (!res.ok) {
					throw new Error(`token login failed: ${res.status} ${JSON.stringify(json)}`);
				}

				if (!json.token) {
					throw new Error(`${json.errorcode || "token_login_failed"}: ${json.error || json.message || "No token returned"}`);
				}

				return json.token;
			})().catch(err => {
				tokenPromise = undefined;
				throw err;
			});
		}

		return tokenPromise;
	}

	async function moodleCall(wsfunction, params = {}) {
		const body = new URLSearchParams({
			wstoken: await getToken(),
			wsfunction,
			moodlewsrestformat: "json",
			...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
		});

		const res = await fetch(moodleUrl(config.baseUrl, "webservice/rest/server.php"), {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body
		});

		const json = await res.json();

		if (json.exception) {
			throw new Error(`${json.errorcode}: ${json.message}`);
		}

		return json;
	}

	async function sendNtfy(title, message) {
		const res = await fetch(config.ntfyTopicUrl, {
			method: "POST",
			headers: {
				Title: encodeRFC2047(title),
				Priority: "high",
				Tags: "warning,school"
			},
			body: message
		});

		if (!res.ok) {
			throw new Error(`ntfy failed: ${res.status} ${await res.text()}`);
		}
	}

	const assignmentsResp = await moodleCall("mod_assign_get_assignments");
	const allAssignments = [];

	for (const course of assignmentsResp.courses || []) {
		for (const assignment of course.assignments || []) {
			allAssignments.push({
				courseName: course.fullname,
				assignId: assignment.id,
				name: assignment.name,
				duedate: assignment.duedate
			});
		}
	}

	summary.totalAssignments = allAssignments.length;

	for (const assignment of allAssignments) {
		if (!assignment.duedate || !isWithinDays(assignment.duedate, config.days)) {
			continue;
		}

		summary.dueSoonAssignments += 1;

		const hourBucket = getHourBucket();
		const key = sentKey(assignment.assignId, hourBucket);
		if (state.sent[key]) {
			summary.skippedAlreadySent += 1;
			continue;
		}

		const statusResp = await moodleCall("mod_assign_get_submission_status", {
			assignid: assignment.assignId
		});

		if (isActuallySubmitted(statusResp)) {
			summary.skippedSubmitted += 1;
			continue;
		}

		const msg = `${assignment.courseName}\nAssignment: ${assignment.name}\nDue: ${formatDue(assignment.duedate)}`;
		await sendNtfy(`Homework Countdown ${remainingText(assignment.duedate)}`, msg);

		state.sent[key] = {
			at: new Date().toISOString(),
			assignId: assignment.assignId,
			name: assignment.name
		};
		summary.notified += 1;
	}

	await options.saveState?.(state);

	return summary;
}
