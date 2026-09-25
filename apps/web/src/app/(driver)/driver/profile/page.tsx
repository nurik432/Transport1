import { eq } from "drizzle-orm";
import { localNow, plural } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getDriverTrips } from "@/lib/queries";
import { IconBus, IconLogout } from "@/components/icons";
import { PushSetup } from "@/components/push-setup";
import { VAPID_PUBLIC_KEY } from "@/lib/push";

/** Up to two initials for the avatar, e.g. "Рустам Каримов" → "РК". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-card p-3.5">
      <span className="text-[26px] font-extrabold tabular-nums">{value}</span>
      <span className="text-[13px] text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function DriverProfile() {
  const user = await requireRole("driver");
  const now = localNow();

  const [rows, trips] = await Promise.all([
    db
      .select({
        vehicleNumber: schema.vehicles.number,
        vehicleModel: schema.vehicles.model,
        capacity: schema.vehicles.capacity,
      })
      .from(schema.drivers)
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.drivers.vehicleId))
      .where(eq(schema.drivers.userId, user.id))
      .limit(1),
    getDriverTrips(user.id, now.date),
  ]);
  const vehicle = rows[0];
  const completed = trips.filter((t) => t.status === "completed");
  const carried = trips.reduce((sum, t) => sum + t.boardedTotal, 0);

  return (
    <>
      <header className="flex items-center gap-3.5 px-5 pt-5 pb-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ink text-xl font-bold text-on-ink"
        >
          {initials(user.name)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-[22px] font-bold">{user.name}</h1>
          <p className="truncate text-sm text-muted-foreground">Водитель · {user.phone}</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-4">
        <section className="flex flex-col gap-2">
          <h2 className="mx-1 text-[13px] font-semibold text-muted-foreground">Сегодня</h2>
          <div className="grid grid-cols-3 gap-2">
            <Tile value={trips.length} label={plural(trips.length, ["рейс", "рейса", "рейсов"])} />
            <Tile value={completed.length} label={completed.length === 1 ? "выполнен" : "выполнено"} />
            <Tile value={carried} label="перевезено" />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="mx-1 text-[13px] font-semibold text-muted-foreground">Закреплённый транспорт</h2>
          <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <IconBus className="size-5.5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-semibold">{vehicle?.vehicleModel ?? "Не назначен"}</span>
              <span className="truncate text-[13px] text-muted-foreground">
                {vehicle?.vehicleNumber
                  ? `${vehicle.vehicleNumber} · ${vehicle.capacity} ${plural(vehicle.capacity ?? 0, ["место", "места", "мест"])}`
                  : "Обратитесь к администратору"}
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="mx-1 text-[13px] font-semibold text-muted-foreground">Уведомления</h2>
          <PushSetup
            vapidPublicKey={VAPID_PUBLIC_KEY}
            hint="Сообщения администратора и изменения маршрута приходят на это устройство."
          />
        </section>

        <form action="/logout" method="post">
          <button
            type="submit"
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-border bg-card text-[15px] font-semibold text-danger-foreground transition-colors hover:bg-danger-soft"
          >
            <IconLogout className="size-4" />
            Выйти из аккаунта
          </button>
        </form>
      </main>
    </>
  );
}
