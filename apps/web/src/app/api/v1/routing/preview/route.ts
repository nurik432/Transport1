import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchRoadPath } from "@transport/db/routing";
import { getSessionUser } from "@/lib/auth";

const bodySchema = z.object({
  points: z
    .array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }))
    .min(2, "Нужно минимум две точки")
    .max(25, "Слишком много точек"),
  /** average speed used to turn road distance into minutes */
  speedKph: z.number().min(5).max(80).optional(),
  /** minutes added per intermediate stop */
  dwellMin: z.number().min(0).max(10).optional(),
});

/**
 * Preview the driving path through a set of points and suggest arrival offsets.
 * Called only when an administrator asks for it while editing a route, never
 * while rendering a page.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
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
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Некорректные данные" },
      { status: 400 },
    );
  }

  const speedKph = parsed.data.speedKph ?? 22;
  const dwellMin = parsed.data.dwellMin ?? 1;
  const path = await fetchRoadPath(parsed.data.points);

  // Time to each stop: driving time from the road distance plus a stop pause.
  const suggestedOffsets = path.stopDistancesM.map((distanceM, index) =>
    Math.round((distanceM / 1000 / speedKph) * 60 + Math.max(0, index) * dwellMin),
  );

  return NextResponse.json(
    {
      ok: true,
      points: path.points,
      totalDistanceM: path.totalDistanceM,
      stopDistancesM: path.stopDistancesM,
      source: path.source,
      suggestedOffsets,
      error: path.error,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
