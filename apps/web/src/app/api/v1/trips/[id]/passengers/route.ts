import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getPassengerPositions } from "@/lib/passenger-live";

/** Where the passengers who share their position are. Only the trip's driver and admins. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || (user.role !== "driver" && user.role !== "admin")) {
    return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ ok: false, error: "Некорректный рейс" }, { status: 400 });
  }
  if (user.role === "driver") {
    const trip = await db.select({ driverId: schema.trips.driverId }).from(schema.trips).where(eq(schema.trips.id, id)).limit(1);
    if (trip[0]?.driverId !== user.id) {
      return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 403 });
    }
  }

  const passengers = await getPassengerPositions(id);
  return NextResponse.json({ ok: true, passengers }, { headers: { "cache-control": "no-store" } });
}
