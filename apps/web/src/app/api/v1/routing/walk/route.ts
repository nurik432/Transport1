import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { distanceMeters } from "@transport/domain";
import { fetchWalkingPath } from "@transport/db/routing";
import { getSessionUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

const bodySchema = z.object({
  stopId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Beyond this a walking route makes no sense: the passenger is elsewhere in the city or away. */
const MAX_WALK_M = 15_000;

/**
 * Walking directions from the passenger's current position to a stop.
 * Called only when the passenger presses the button; the position is used for
 * this request and not stored.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный запрос" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
  }

  const [stop] = await db
    .select({ lat: schema.stops.lat, lng: schema.stops.lng })
    .from(schema.stops)
    .where(eq(schema.stops.id, parsed.data.stopId))
    .limit(1);
  if (!stop) {
    return NextResponse.json({ ok: false, error: "Остановка не найдена" }, { status: 404 });
  }

  const from = { lat: parsed.data.lat, lng: parsed.data.lng };
  if (distanceMeters(from, stop) > MAX_WALK_M) {
    return NextResponse.json({ ok: false, error: "Вы слишком далеко от остановки для пешего маршрута" }, { status: 422 });
  }

  const path = await fetchWalkingPath(from, stop);
  return NextResponse.json(
    { ok: true, points: path.points, distanceM: path.distanceM, durationMin: path.durationMin, source: path.source },
    { headers: { "cache-control": "no-store" } },
  );
}
