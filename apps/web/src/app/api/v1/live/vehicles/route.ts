import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getLiveSignals, getLiveVehicles } from "@/lib/live";

/** Every vehicle currently running, plus operational signals. Admin only. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }

  const now = new Date();
  const [vehicles, signals] = await Promise.all([getLiveVehicles(now), getLiveSignals(now)]);

  return NextResponse.json({ ok: true, vehicles, signals, at: now.toISOString() }, { headers: { "cache-control": "no-store" } });
}
