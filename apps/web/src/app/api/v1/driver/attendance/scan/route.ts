import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { recordScan } from "@/lib/attendance";

const bodySchema = z.object({
  token: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracyM: z.number().min(0).max(100_000).nullable().optional(),
});

/** The driver app posts one QR scan here; the server decides the date and window. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "driver") {
    return NextResponse.json({ ok: false, error: "Отметка доступна только водителям" }, { status: 401 });
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

  const { token, lat, lng, accuracyM } = parsed.data;
  const position = lat != null && lng != null ? { lat, lng, accuracyM: accuracyM ?? null } : null;
  const result = await recordScan({ userId: user.id, token, position });
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
