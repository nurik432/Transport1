// Готовит «живую» обстановку на демо-базе: три вечерних рейса в пути
// (один по маршруту, один с отклонением, один без GPS) и один рейс без назначения.
// Пока идёт запись, водители №1 и №2 продолжают слать точки раз в 15 секунд.
import postgres from "postgres";

const TICK_MS = 15_000;
const BACKFILL_POINTS = 8;
const OFFSET_DEG = 0.0055; // ≈ 600 м к северу — заметное отклонение от линии

/**
 * @param {{ browser: import("playwright").Browser, base: string, databaseUrl: string, driverPassword: string }} opts
 * @returns {Promise<() => Promise<void>>} остановка подачи точек
 */
export async function stageLive({ browser, base, databaseUrl, driverPassword }) {
  if (!/demo/i.test(new URL(databaseUrl).pathname)) {
    throw new Error("stageLive меняет данные и работает только с демо-базой (имя базы должно содержать demo)");
  }
  const sql = postgres(databaseUrl, { max: 2 });
  try {
    const evening = await sql`
      select t.id, r.name, u.phone, rv.path
      from trips t
      join routes r on r.id = t.route_id
      join users u on u.id = t.driver_id
      join route_versions rv on rv.id = coalesce(t.route_version_id, r.current_version_id)
      where t.date = (now() at time zone 'Asia/Dushanbe')::date
        and r.direction = 'from_work' and t.vehicle_no = 1
        and t.start_time = (select min(start_time) from trips t2 where t2.date = t.date and t2.route_id in
            (select id from routes where direction = 'from_work'))
      order by r.name`;
    if (evening.length < 3) throw new Error(`для сцены нужно три вечерних рейса, нашлось ${evening.length}`);

    const ids = evening.map((t) => t.id);
    await sql`delete from vehicle_positions where trip_id in ${sql(ids)}`;
    await sql`
      update trips set status = 'in_progress',
        start_time = date_trunc('minute', (now() at time zone 'Asia/Dushanbe')::time - interval '14 minutes'),
        started_at = now() - interval '13 minutes'
      where id in ${sql(ids)}`;
    await sql`
      update trips set vehicle_id = null, driver_id = null
      where id = (
        select t.id from trips t join routes r on r.id = t.route_id
        where t.date = (now() at time zone 'Asia/Dushanbe')::date and t.status = 'planned' and r.direction = 'from_work'
        order by t.start_time desc, r.name desc limit 1)`;

    // №1 едет по линии, №2 уходит в сторону, третий молчит (нет GPS).
    const feeds = [];
    for (const [i, trip] of evening.slice(0, 2).entries()) {
      feeds.push(await startFeed({ browser, base, trip, driverPassword, deviate: i === 1 }));
    }
    return async () => {
      for (const f of feeds) await f();
    };
  } finally {
    await sql.end();
  }
}

async function startFeed({ browser, base, trip, driverPassword, deviate }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.locator('input[type="tel"]').fill(trip.phone);
  await page.locator('input[type="password"]').fill(driverPassword);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/driver**");

  const path = typeof trip.path === "string" ? JSON.parse(trip.path) : trip.path;
  let index = Math.floor(path.length * 0.15);
  const stepPts = Math.max(1, Math.floor(path.length / 60));
  let sent = 0;

  const post = async (recordedAt) => {
    index = Math.min(path.length - 1, index + stepPts);
    const [lat, lng] = path[index];
    const off = deviate && sent >= BACKFILL_POINTS - 4 ? OFFSET_DEG : 0;
    sent++;
    const res = await ctx.request.post(`${base}/api/v1/positions`, {
      data: { tripId: trip.id, lat: lat + off, lng, speedKph: 32, accuracyM: 8, recordedAt: recordedAt.toISOString() },
    });
    if (!res.ok()) throw new Error(`позиция ${trip.name} не принята: ${res.status()} ${await res.text()}`);
  };

  const now = Date.now();
  for (let i = BACKFILL_POINTS; i >= 1; i--) await post(new Date(now - i * 60_000));
  const timer = setInterval(() => post(new Date()).catch((e) => console.error(e.message)), TICK_MS);
  return async () => {
    clearInterval(timer);
    await ctx.close();
  };
}
