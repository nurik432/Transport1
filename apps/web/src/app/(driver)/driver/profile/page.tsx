import { eq } from "drizzle-orm";
import { localNow } from "@transport/domain";
import { requireRole } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getDriverTrips } from "@/lib/queries";
import { MobileHeader } from "@/components/mobile-shell";
import { Card, SectionTitle } from "@/components/ui";
import { IconBus, IconLogout } from "@/components/icons";

export default async function DriverProfile() {
  const user = await requireRole("driver");
  const now = localNow();

  const [rows, trips] = await Promise.all([
    db
      .select({ vehicleNumber: schema.vehicles.number, vehicleModel: schema.vehicles.model, capacity: schema.vehicles.capacity })
      .from(schema.drivers)
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.drivers.vehicleId))
      .where(eq(schema.drivers.userId, user.id))
      .limit(1),
    getDriverTrips(user.id, now.date),
  ]);
  const vehicle = rows[0];

  return (
    <>
      <MobileHeader title="Профиль" subtitle={user.phone} />
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        <Card>
          <p className="text-lg font-semibold">{user.name}</p>
          <p className="text-sm text-muted-foreground">Водитель</p>
        </Card>

        <section>
          <SectionTitle>Закреплённый транспорт</SectionTitle>
          <Card className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <IconBus />
            </span>
            <div>
              <p className="text-sm font-medium">{vehicle?.vehicleModel ?? "Не назначен"}</p>
              <p className="text-xs text-muted-foreground">
                {vehicle?.vehicleNumber ? `${vehicle.vehicleNumber} · ${vehicle.capacity} мест` : "Обратитесь к администратору"}
              </p>
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Сегодня</SectionTitle>
          <Card>
            <p className="text-sm">
              Рейсов: <span className="font-semibold tabular-nums">{trips.length}</span>, завершено{" "}
              <span className="font-semibold tabular-nums">{trips.filter((t) => t.status === "completed").length}</span>
            </p>
          </Card>
        </section>

        <form action="/logout" method="post">
          <button
            type="submit"
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
          >
            <IconLogout className="size-4" />
            Выйти из аккаунта
          </button>
        </form>
      </main>
    </>
  );
}
