import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getTripLive, getTripTrail } from "@/lib/live";

/** Live position and per-stop arrival estimates of one trip. Polled by the map. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });

  const { id } = await params;
  const [live, trail] = await Promise.all([getTripLive(id), user.role === "admin" ? getTripTrail(id) : Promise.resolve([])]);

  return NextResponse.json(
    { ok: true, ...live, trail },
    { headers: { "cache-control": "no-store" } },
  );
}
