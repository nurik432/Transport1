import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { recordPosition } from "@/lib/live";

const bodySchema = z.object({
  tripId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speedKph: z.number().min(0).max(300).nullable().optional(),
  headingDeg: z.number().min(0).max(360).nullable().optional(),
  accuracyM: z.number().min(0).max(100_000).nullable().optional(),
  recordedAt: z.string().datetime().optional(),
});

/** The driver app posts one GPS sample here while a trip is running. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "driver") {
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

  const result = await recordPosition({
    tripId: parsed.data.tripId,
    driverId: user.id,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    speedKph: parsed.data.speedKph ?? null,
    headingDeg: parsed.data.headingDeg ?? null,
    accuracyM: parsed.data.accuracyM ?? null,
    recordedAt: parsed.data.recordedAt ? new Date(parsed.data.recordedAt) : undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
