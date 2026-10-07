import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { recordPassengerPosition, stopSharingPosition } from "@/lib/passenger-live";

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000).nullable().optional(),
});

/** A booked passenger shares their position with the driver while the trip is running. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "passenger") {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: "Некорректный рейс" }, { status: 400 });
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

  const result = await recordPassengerPosition({
    tripId: id,
    passengerId: user.id,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    accuracyM: parsed.data.accuracyM ?? null,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}

/** Stop sharing: the last point is removed at once, not left to go stale. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "passenger") {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: "Некорректный рейс" }, { status: 400 });
  }
  await stopSharingPosition(id, user.id);
  return NextResponse.json({ ok: true });
}
