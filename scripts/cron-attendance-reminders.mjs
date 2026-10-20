// Cron job: asks the running web app to send due timesheet reminders.
// Dokku runs it every 5 minutes (app.json → cron); locally: `pnpm cron:attendance`.
// Needs CRON_SECRET and the app address in CRON_TARGET_URL or APP_URL.

const base = process.env.CRON_TARGET_URL || process.env.APP_URL;
const secret = process.env.CRON_SECRET;

if (!base || !secret) {
  console.error("cron: нужны CRON_SECRET и CRON_TARGET_URL (или APP_URL)");
  process.exit(1);
}

const url = new URL("/api/v1/cron/attendance-reminders", base);
const response = await fetch(url, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(60_000),
});
const text = await response.text();
console.log(`cron: ${response.status} ${text}`);
if (!response.ok) process.exit(1);
