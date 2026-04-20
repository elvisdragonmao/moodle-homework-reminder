# Moodle Homework Reminder

<img src="og.png" alt="Preview" width="600" />

A small reminder service for Moodle-based school systems (such as NYCU E3, NCKU Moodle, NTNU Moodle, etc.).

It checks your Moodle assignments on a schedule, determines whether each assignment has already been submitted, and sends reminders to your phone through ntfy when a deadline is approaching.

## Features

- Fetch assignments from Moodle Web Service API
- Check per-assignment submission status
- Send push notifications to iPhone / Android using ntfy
- Remind only for assignments due within the next 24 hours
- Avoid duplicate notifications within the same time bucket
- Easy to run locally or deploy on GitHub Actions, Cloudflare Workers, Zeabur, or your preferred Node.js hosting platform.

## How it works

This project uses Moodle's assignment APIs:

- `mod_assign_get_assignments` to list assignments
- `mod_assign_get_submission_status` to check whether the current user has actually submitted

If an assignment is still not submitted and its deadline is within 24 hours, the script sends a notification to your ntfy topic.

### Flow

1. Read environment variables
2. Call Moodle API to fetch assignments
3. Filter assignments due within the next 24 hours
4. Call Moodle API again for each candidate assignment to check submission status
5. Send a notification via ntfy if the assignment is still not submitted
6. Store a local reminder state to avoid duplicate notifications

## Requirements

- Node.js 18+ recommended
- A Moodle instance with Web Services enabled
- A Moodle username and password
- An ntfy topic you can publish to

## Environment variables

For local Node.js runs, create a `.env` file:

```env
MOODLE_BASE_URL=https://your-moodle-domain
USERNAME=your-username
PASSWORD=your-password
NTFY_TOPIC_URL=https://ntfy.sh/your-topic-name
```

Optional:

```env
DAYS=3 # how many days before deadline to start sending reminders (default: 1)
STATE_FILE=./state.json
```

## Development

```bash
pnpm install
pnpm start # or node index.js
```

## Deployment

First create a room at <https://ntfy.sh> and get the topic URL. Install the ntfy app on your phone and subscribe to that topic to receive notifications.

Then choose one of the deployment options below.

### 1. GitHub Actions

This is the easiest deployment option if you just want the checker to run every hour.

Create `.github/workflows/reminder.yml`:

```yaml
name: Moodle Reminder

on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch:

jobs:
  run-reminder:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm

      - name: Setup pnpm
        uses: pnpm/action-setup@v6

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run reminder
        env:
          MOODLE_BASE_URL: ${{ secrets.MOODLE_BASE_URL }}
          USERNAME: ${{ secrets.USERNAME }}
          PASSWORD: ${{ secrets.PASSWORD }}
          NTFY_TOPIC_URL: ${{ secrets.NTFY_TOPIC_URL }}
          DAYS: ${{ secrets.DAYS }}
        run: node runner.js
```

#### GitHub Actions secrets

Add these repository secrets:

- `MOODLE_BASE_URL`
- `USERNAME`
- `PASSWORD`
- `NTFY_TOPIC_URL`
- `DAYS`

#### Notes

- This is great for scheduled execution
- `workflow_dispatch` lets you manually trigger a test run
- GitHub Actions runners are ephemeral, so local `state.json` will not persist between runs unless you upload/download artifacts or use external storage

### 2. Cloudflare Workers

The repo now includes `worker.js` and a cron trigger in `wrangler.jsonc`.

Important: Cloudflare Workers do not read your Node.js `.env` file.

For local `wrangler dev`, create a `.dev.vars` file:

```env
MOODLE_BASE_URL=https://e3p.nycu.edu.tw
USERNAME=your-username
PASSWORD=your-password
NTFY_TOPIC_URL=https://ntfy.sh/your-topic-name
DAYS=1
```

For deployed Workers, set secrets:

```bash
wrangler secret put MOODLE_BASE_URL
wrangler secret put USERNAME
wrangler secret put PASSWORD
wrangler secret put NTFY_TOPIC_URL
wrangler secret put DAYS
```

Deploy it:

```bash
wrangler deploy
```

Notes:

- The Worker runs every hour via `0 * * * *`
- `fetch()` is also exposed, so you can manually trigger it with `wrangler dev` or the deployed URL
- This Worker intentionally ignores `state.json`, so the same unfinished assignment can notify again on later hourly runs
- If env is missing, the response now tells you exactly which keys are missing

### 3. Zeabur

Directly deploy the Node.js app on Zeabur, and remind to change the environment variables in the Zeabur dashboard.

### 4. Own server / local machine

You can also run the script on your own server or local machine. Just make sure to have Node.js installed, set up the environment variables, and run `node index.js` on a schedule (e.g., using cron).

#### Cron example

1. Open your crontab:

```bash
crontab -e
```

2. Add a line to run the script every hour:

```cron
0 * * * * cd /path/to/your/project && node index.js >> reminder.log 2>&1
```

This will execute the script every hour and log output to `reminder.log`.

## License

Apache-2.0 License
