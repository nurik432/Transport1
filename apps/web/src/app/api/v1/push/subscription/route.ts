import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { removeSubscription, saveSubscription } from "@/lib/push";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный запрос" }, { status: 400 });
  }

  const parsed = subscriptionSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Некорректная подписка" }, { status: 400 });

  await saveSubscription(user.id, parsed.data, request.headers.get("user-agent"));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ ok: false, error: "Не указан endpoint" }, { status: 400 });

  await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
