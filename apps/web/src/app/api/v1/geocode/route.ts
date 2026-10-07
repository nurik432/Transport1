import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { reversePlace, searchPlaces } from "@/lib/geocode";

/**
 * Place search for the administrator (stops) and the passenger (home address):
 * a name or an address in, coordinates out.
 * GET because it is an idempotent read and the query is a place name, not
 * anything personal.
 *
 * `lib/geocode.ts` already paces the outgoing calls; the ceiling here is about a
 * single administrator (or a stuck browser tab) hammering the endpoint.
 */

const querySchema = z.object({
  q: z.string().trim().min(3, "Введите минимум три символа").max(120, "Слишком длинный запрос"),
  limit: z.coerce.number().int().min(1).max(8).optional(),
});

const reverseSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

/** In-process only: with several instances this loosens, which is one more reason to self-host. */
function overLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 100) for (const [id, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(id);
  return recent.length > MAX_PER_WINDOW;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "passenger")) {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }
  if (overLimit(user.id)) {
    return NextResponse.json({ ok: false, error: "Слишком много запросов, подождите" }, { status: 429 });
  }

  const params = new URL(request.url).searchParams;
  const noStore = { "cache-control": "private, max-age=60" };

  // Reverse lookup: fills the address of a point placed by clicking the map.
  if (params.has("lat") || params.has("lng")) {
    const parsed = reverseSchema.safeParse({ lat: params.get("lat"), lng: params.get("lng") });
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Некорректные координаты" }, { status: 400 });
    }
    const place = await reversePlace(parsed.data.lat, parsed.data.lng);
    return NextResponse.json({ ok: true, place }, { headers: noStore });
  }

  const parsed = querySchema.safeParse({ q: params.get("q") ?? "", limit: params.get("limit") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Некорректный запрос" },
      { status: 400 },
    );
  }

  const result = await searchPlaces(parsed.data.q, parsed.data.limit);
  // A provider that is down is reported as an empty list with a note, not as a
  // 5xx: the administrator can still place the point on the map.
  return NextResponse.json(
    { ok: true, places: result.places, source: result.source, error: result.error },
    { headers: noStore },
  );
}
