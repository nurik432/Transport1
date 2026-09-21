import "dotenv/config";
import bcrypt from "bcryptjs";
import { addDays, localDateTime, localNow, parseTimeToMinutes, weekdayOfDate } from "@transport/domain";
import { createDb } from "./client";
import * as s from "./schema";

/*
 * Seed data for Khujand (Tajikistan).
 * Produces: 1 admin, 4 drivers, 4 vehicles, 16 stops, 3 lines x 2 directions,
 * schedules, ~74 passengers, 14 days of completed trips with driver headcounts and
 * passenger bookings, plus planned trips for today and the next 7 days.
 * Deterministic (seeded PRNG) so re-running after `reset` yields the same picture.
 */

// ---------- deterministic PRNG ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260921);
const chance = (p: number) => rnd() < p;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const jitter = (max: number) => Math.floor(rnd() * (max + 1));

export const SEED_PASSWORDS = { admin: "admin123", driver: "driver123", passenger: "pass123" } as const;

// ---------- reference data ----------
const STOPS = [
  { key: "office", name: "Головной офис", lat: 40.269, lng: 69.665, address: "Промзона, ул. Промышленная 1" },
  { key: "panjshanbe", name: "Панчшанбе (Центральный рынок)", lat: 40.287, lng: 69.6265, address: "пл. Панчшанбе" },
  { key: "station", name: "Ж/д вокзал", lat: 40.277, lng: 69.648, address: "ул. Вокзальная" },
  { key: "fortress", name: "Худжандская крепость", lat: 40.286, lng: 69.62, address: "ул. Ленина" },
  { key: "university", name: "Университет (ХГУ)", lat: 40.2895, lng: 69.6335, address: "пр. Мавлонбекова" },
  { key: "stadium", name: "Стадион", lat: 40.281, lng: 69.631, address: "ул. Камоли Худжанди" },
  { key: "theatre", name: "Театр им. Камоли Худжанди", lat: 40.2825, lng: 69.628, address: "ул. Ленина" },
  { key: "busstation", name: "Автовокзал", lat: 40.27, lng: 69.625, address: "ул. Гагарина" },
  { key: "bridge", name: "Мост через Сырдарью", lat: 40.2925, lng: 69.6325, address: "ул. Исмоили Сомони" },
  { key: "mkr12", name: "Микрорайон 12", lat: 40.296, lng: 69.612, address: "12-й микрорайон" },
  { key: "mkr18", name: "Микрорайон 18", lat: 40.301, lng: 69.616, address: "18-й микрорайон" },
  { key: "mkr19", name: "Микрорайон 19", lat: 40.304, lng: 69.623, address: "19-й микрорайон" },
  { key: "mkr20", name: "Микрорайон 20", lat: 40.307, lng: 69.63, address: "20-й микрорайон" },
  { key: "buston", name: "Бустон (центр)", lat: 40.235, lng: 69.698, address: "г. Бустон" },
  { key: "airport", name: "Аэропорт", lat: 40.2154, lng: 69.6947, address: "Аэропорт Худжанд" },
  { key: "gafurov", name: "Гафуров (центр)", lat: 40.218, lng: 69.715, address: "г. Гафуров" },
] as const;
type StopKey = (typeof STOPS)[number]["key"];

interface LineDef {
  name: string;
  description: string;
  color: string;
  /** stops in morning (to_work) order, last one is the office; offsets in minutes */
  stops: { key: StopKey; offset: number }[];
  /** evening offsets (office first), same stops reversed */
  eveningOffsets: number[];
  morning: string[];
  evening: string[];
  vehicle: number; // index into VEHICLES
  driver: number; // index into DRIVERS
  /** number of passengers assigned to this line */
  passengers: number;
  /** weights of morning departures for passenger preference */
  morningWeights: number[];
  /** probability of extra walk-in riders (not booked) per trip */
  walkIns: [number, number];
}

const VEHICLES = [
  { number: "01 A 123 AA", model: "Автобус ПАЗ-4234", capacity: 30 },
  { number: "02 B 456 AB", model: "Микроавтобус Mercedes Sprinter", capacity: 18 },
  { number: "03 C 789 AC", model: "Автобус Isuzu NovoCiti", capacity: 30 },
  { number: "04 D 012 AD", model: "Микроавтобус ГАЗель Next", capacity: 16 },
];

const DRIVERS = [
  { name: "Рустам Каримов", phone: "+992900000101" },
  { name: "Далер Юсупов", phone: "+992900000102" },
  { name: "Бахтиёр Саидов", phone: "+992900000103" },
  { name: "Сухроб Мирзоев", phone: "+992900000104" },
];

const LINES: LineDef[] = [
  {
    name: "№1",
    description: "Микрорайоны — Университет — Головной офис",
    color: "#dc2626",
    stops: [
      { key: "mkr12", offset: 0 },
      { key: "mkr18", offset: 4 },
      { key: "mkr19", offset: 8 },
      { key: "mkr20", offset: 12 },
      { key: "bridge", offset: 18 },
      { key: "university", offset: 22 },
      { key: "panjshanbe", offset: 27 },
      { key: "office", offset: 40 },
    ],
    eveningOffsets: [0, 13, 18, 22, 28, 32, 36, 40],
    morning: ["07:00", "07:30", "08:00"],
    evening: ["17:30", "18:00", "18:30"],
    vehicle: 0,
    driver: 0,
    passengers: 66,
    morningWeights: [0.25, 0.6, 0.15],
    walkIns: [1, 4],
  },
  {
    name: "№2",
    description: "Автовокзал — Центр — Ж/д вокзал — Головной офис",
    color: "#2563eb",
    stops: [
      { key: "busstation", offset: 0 },
      { key: "theatre", offset: 5 },
      { key: "fortress", offset: 8 },
      { key: "stadium", offset: 12 },
      { key: "station", offset: 19 },
      { key: "office", offset: 28 },
    ],
    eveningOffsets: [0, 9, 16, 20, 23, 28],
    morning: ["07:00", "07:30", "08:00"],
    evening: ["17:30", "18:00", "18:30"],
    vehicle: 1,
    driver: 1,
    passengers: 34,
    morningWeights: [0.3, 0.45, 0.25],
    walkIns: [0, 1],
  },
  {
    name: "№3",
    description: "Гафуров — Бустон — Аэропорт — Головной офис",
    color: "#16a34a",
    stops: [
      { key: "gafurov", offset: 0 },
      { key: "buston", offset: 9 },
      { key: "airport", offset: 15 },
      { key: "office", offset: 32 },
    ],
    eveningOffsets: [0, 17, 23, 32],
    morning: ["07:00", "07:45"],
    evening: ["17:30", "18:15"],
    vehicle: 2,
    driver: 2,
    passengers: 8,
    morningWeights: [0.6, 0.4],
    walkIns: [0, 1],
  },
];

const FIRST_NAMES = [
  "Фаррух", "Дилшод", "Манижа", "Нигора", "Рустам", "Шахноза", "Далер", "Мадина", "Бахтиёр", "Зарина",
  "Фируз", "Сабина", "Умед", "Гулноз", "Комрон", "Парвина", "Сухроб", "Нилуфар", "Джамшед", "Мехрубон",
  "Азиз", "Тахмина", "Исмоил", "Мавзуна", "Хуршед", "Сарвиноз", "Абдулло", "Малика", "Шерзод", "Фарзона",
];
const LAST_NAMES = ["Рахимов", "Каримов", "Назаров", "Шарипов", "Юсупов", "Холиков", "Саидов", "Мирзоев", "Ахмедов", "Абдуллоев", "Хакимов", "Одинаев"];
const FEMALE = new Set(["Манижа", "Нигора", "Шахноза", "Мадина", "Зарина", "Сабина", "Гулноз", "Парвина", "Нилуфар", "Тахмина", "Мавзуна", "Сарвиноз", "Малика", "Фарзона"]);
const DEPARTMENTS = ["Производство", "Бухгалтерия", "IT", "Логистика", "Продажи", "HR", "Снабжение"];

// ---------- main ----------
async function main() {
  const db = createDb();
  const now = localNow();
  const today = now.date;
  console.log(`seeding for local date ${today}`);

  const existing = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (existing.length) {
    console.log("database already has data; run `pnpm db:reset && pnpm db:migrate` first");
    process.exit(1);
  }

  const [adminHash, driverHash, passHash] = await Promise.all([
    bcrypt.hash(SEED_PASSWORDS.admin, 10),
    bcrypt.hash(SEED_PASSWORDS.driver, 10),
    bcrypt.hash(SEED_PASSWORDS.passenger, 10),
  ]);

  // settings
  await db.insert(s.settings).values({
    key: "load_thresholds",
    value: { overloadPct: 100, overloadShare: 0.3, overloadAvgPct: 95, lowAvgPct: 40, minTrips: 3 },
  });

  // admin
  await db.insert(s.users).values({ name: "Администратор", phone: "+992900000001", role: "admin", passwordHash: adminHash });

  // vehicles
  const vehicleRows = await db.insert(s.vehicles).values(VEHICLES).returning();

  // drivers
  const driverUsers = await db
    .insert(s.users)
    .values(DRIVERS.map((d) => ({ name: d.name, phone: d.phone, role: "driver" as const, passwordHash: driverHash })))
    .returning();
  await db.insert(s.drivers).values(driverUsers.map((u, i) => ({ userId: u.id, vehicleId: vehicleRows[i]!.id })));

  // stops
  const stopRows = await db.insert(s.stops).values(STOPS.map(({ name, lat, lng, address }) => ({ name, lat, lng, address }))).returning();
  const stopId = new Map<StopKey, string>(STOPS.map((st, i) => [st.key, stopRows[i]!.id]));

  // routes (two per line) + route stops + schedules
  interface RouteCtx {
    line: LineDef;
    direction: "to_work" | "from_work";
    routeId: string;
    routeStops: { stopId: string; stopKey: StopKey; seq: number; offsetMin: number }[];
    schedules: { id: string; departureTime: string }[];
    vehicle: (typeof vehicleRows)[number];
    driverId: string;
  }
  const routeCtxs: RouteCtx[] = [];
  for (const line of LINES) {
    for (const direction of ["to_work", "from_work"] as const) {
      const [route] = await db
        .insert(s.routes)
        .values({
          name: line.name,
          description: direction === "to_work" ? `${line.description} (утро)` : `${line.description} (вечер)`,
          direction,
          color: line.color,
          plannedCapacity: VEHICLES[line.vehicle]!.capacity,
        })
        .returning();
      const ordered = direction === "to_work" ? line.stops : [...line.stops].reverse();
      const offsets = direction === "to_work" ? line.stops.map((x) => x.offset) : line.eveningOffsets;
      const rsValues = ordered.map((st, i) => ({ routeId: route!.id, stopId: stopId.get(st.key)!, seq: i + 1, offsetMin: offsets[i]! }));
      await db.insert(s.routeStops).values(rsValues);
      const times = direction === "to_work" ? line.morning : line.evening;
      const scheduleRows = await db
        .insert(s.routeSchedules)
        .values(times.map((t) => ({ routeId: route!.id, departureTime: t, daysOfWeek: [1, 2, 3, 4, 5] })))
        .returning();
      routeCtxs.push({
        line,
        direction,
        routeId: route!.id,
        routeStops: rsValues.map((v, i) => ({ ...v, stopKey: ordered[i]!.key })),
        schedules: scheduleRows.map((r) => ({ id: r.id, departureTime: r.departureTime })),
        vehicle: vehicleRows[line.vehicle]!,
        driverId: driverUsers[line.driver]!.id,
      });
    }
  }

  // passengers
  interface PassengerCtx {
    userId: string;
    line: LineDef;
    homeStopKey: StopKey;
    morningIdx: number;
    eveningIdx: number;
    attendance: number;
    booking: number;
  }
  const passengerCtxs: PassengerCtx[] = [];
  let phoneCounter = 1;
  const usedNames = new Set<string>();
  for (const line of LINES) {
    const boardingStops = line.stops.slice(0, -1); // exclude office
    for (let i = 0; i < line.passengers; i++) {
      let name = "";
      do {
        const fn = pick(FIRST_NAMES);
        const ln = pick(LAST_NAMES) + (FEMALE.has(fn) ? "а" : "");
        name = `${fn} ${ln}`;
      } while (usedNames.has(name));
      usedNames.add(name);
      const home = pick(boardingStops);
      const homeStop = STOPS.find((st) => st.key === home.key)!;
      const [u] = await db
        .insert(s.users)
        .values({ name, phone: `+99291${String(phoneCounter++).padStart(7, "0")}`, role: "passenger", passwordHash: passHash })
        .returning();
      await db.insert(s.passengers).values({
        userId: u!.id,
        homeAddress: `${homeStop.address}, д. ${1 + jitter(40)}`,
        lat: homeStop.lat + (rnd() - 0.5) * 0.006,
        lng: homeStop.lng + (rnd() - 0.5) * 0.008,
        department: pick(DEPARTMENTS),
      });
      // preferred morning departure by weights
      let r = rnd();
      let morningIdx = 0;
      for (let k = 0; k < line.morningWeights.length; k++) {
        r -= line.morningWeights[k]!;
        if (r <= 0) {
          morningIdx = k;
          break;
        }
      }
      passengerCtxs.push({
        userId: u!.id,
        line,
        homeStopKey: home.key,
        morningIdx,
        eveningIdx: Math.floor(rnd() * line.evening.length),
        attendance: 0.75 + rnd() * 0.2,
        booking: 0.55 + rnd() * 0.35,
      });
      // favorites: home stop + morning route
      const morningRoute = routeCtxs.find((rc) => rc.line === line && rc.direction === "to_work")!;
      await db.insert(s.passengerFavorites).values([
        { passengerId: u!.id, routeId: morningRoute.routeId },
        { passengerId: u!.id, stopId: stopId.get(home.key)! },
      ]);
    }
  }

  // trips: past 14 days (completed with facts), today + 7 days (planned)
  let tripCount = 0;
  for (let dayOffset = -14; dayOffset <= 7; dayOffset++) {
    const date = addDays(today, dayOffset);
    const weekday = weekdayOfDate(date);
    if (weekday > 5) continue;
    const isPast = dayOffset < 0;
    for (const rc of routeCtxs) {
      for (const [schedIdx, sched] of rc.schedules.entries()) {
        const departureMin = parseTimeToMinutes(sched.departureTime);
        const tripStartAt = localDateTime(date, departureMin);
        const isFuture = !isPast && tripStartAt.getTime() > now.instant.getTime();
        const status = isPast || !isFuture ? "completed" : "planned";
        const [trip] = await db
          .insert(s.trips)
          .values({
            routeId: rc.routeId,
            scheduleId: sched.id,
            vehicleId: rc.vehicle.id,
            driverId: rc.driverId,
            date,
            startTime: sched.departureTime,
            status,
            startedAt: status === "completed" ? new Date(tripStartAt.getTime() + jitter(3) * 60_000) : null,
            finishedAt:
              status === "completed" ? new Date(tripStartAt.getTime() + (rc.routeStops.at(-1)!.offsetMin + 2 + jitter(6)) * 60_000) : null,
          })
          .returning();
        tripCount++;

        // riders for this trip
        const riders = passengerCtxs.filter((p) => {
          if (p.line !== rc.line) return false;
          const idx = rc.direction === "to_work" ? p.morningIdx : p.eveningIdx;
          if (idx !== schedIdx) return false;
          // Friday slightly lower attendance
          return chance(p.attendance * (weekday === 5 ? 0.85 : 1));
        });
        const bookingProb = status === "completed" ? 1 : 0.8; // for planned trips, only some have booked yet
        const booked = riders.filter((p) => chance(p.booking * bookingProb));
        const boardingStopOf = (p: PassengerCtx) => (rc.direction === "to_work" ? stopId.get(p.homeStopKey)! : stopId.get("office")!);

        if (booked.length) {
          await db.insert(s.passengerTrips).values(
            booked.map((p) => ({
              passengerId: p.userId,
              tripId: trip!.id,
              stopId: boardingStopOf(p),
              status: status === "completed" ? ("boarded" as const) : ("planned" as const),
            })),
          );
        }

        if (status === "completed") {
          // driver headcounts per stop
          const walk = rc.line.walkIns[0] + jitter(rc.line.walkIns[1] - rc.line.walkIns[0]);
          const perStopBoard = new Map<string, number>();
          const perStopAlight = new Map<string, number>();
          for (const p of riders) {
            const home = stopId.get(p.homeStopKey)!;
            if (rc.direction === "to_work") perStopBoard.set(home, (perStopBoard.get(home) ?? 0) + 1);
            else perStopAlight.set(home, (perStopAlight.get(home) ?? 0) + 1);
          }
          const officeId = stopId.get("office")!;
          if (rc.direction === "to_work") {
            // walk-ins board at the busiest stop; everyone alights at the office
            const busiest = rc.routeStops.slice(0, -1).reduce((a, b) => ((perStopBoard.get(b.stopId) ?? 0) > (perStopBoard.get(a.stopId) ?? 0) ? b : a));
            perStopBoard.set(busiest.stopId, (perStopBoard.get(busiest.stopId) ?? 0) + walk);
            perStopAlight.set(officeId, riders.length + walk);
          } else {
            perStopBoard.set(officeId, riders.length + walk);
            const busiest = rc.routeStops.slice(1).reduce((a, b) => ((perStopAlight.get(b.stopId) ?? 0) > (perStopAlight.get(a.stopId) ?? 0) ? b : a));
            perStopAlight.set(busiest.stopId, (perStopAlight.get(busiest.stopId) ?? 0) + walk);
          }
          let delay = jitter(2);
          const events = rc.routeStops.map((rs) => {
            delay += chance(0.3) ? 1 : 0;
            const arrivedAt = new Date(tripStartAt.getTime() + (rs.offsetMin + delay) * 60_000);
            return {
              tripId: trip!.id,
              stopId: rs.stopId,
              arrivedAt,
              departedAt: new Date(arrivedAt.getTime() + 60_000),
              boarded: perStopBoard.get(rs.stopId) ?? 0,
              alighted: perStopAlight.get(rs.stopId) ?? 0,
            };
          });
          await db.insert(s.tripStopEvents).values(events);
        }
      }
    }
  }

  // notifications
  const somePassengers = passengerCtxs.slice(0, 20);
  await db.insert(s.notifications).values([
    ...somePassengers.map((p) => ({
      userId: p.userId,
      type: "schedule_changed" as const,
      title: "Изменение расписания",
      body: "С понедельника рейс №1 в 08:00 отправляется в 08:10.",
      payload: { routeName: "№1" },
    })),
    {
      userId: driverUsers[0]!.id,
      type: "admin_message" as const,
      title: "Сообщение администратора",
      body: "Завтра на маршруте №1 ожидается повышенная загрузка на остановке «Микрорайон 19».",
      payload: {},
    },
  ]);

  console.log(`seeded: ${stopRows.length} stops, ${routeCtxs.length} routes, ${vehicleRows.length} vehicles, ${driverUsers.length} drivers, ${passengerCtxs.length} passengers, ${tripCount} trips`);
  console.log(`logins: admin +992900000001/${SEED_PASSWORDS.admin}; driver ${DRIVERS[0]!.phone}/${SEED_PASSWORDS.driver}; passenger +992910000001/${SEED_PASSWORDS.passenger}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
