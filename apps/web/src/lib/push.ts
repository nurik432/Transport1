import "server-only";
import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

let configured = false;

/** Web push is optional: without VAPID keys the app still works, just without push. */
function ready(): boolean {
  if (configured) return true;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!VAPID_PUBLIC_KEY || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", VAPID_PUBLIC_KEY, priv);
  configured = true;
  return true;
}

export interface PushMessage {
  title: string;
  body: string;
  /** path opened when the notification is clicked */
  url?: string;
  tag?: string;
}

/**
 * Deliver a message to every device of the given users.
 * Endpoints rejected by the push service (410/404) are deleted.
 */
export async function sendPush(userIds: string[], message: PushMessage): Promise<number> {
  if (!ready() || userIds.length === 0) return 0;

  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(inArray(schema.pushSubscriptions.userId, userIds));
  if (!subs.length) return 0;

  const payload = JSON.stringify(message);
  const stale: string[] = [];
  let delivered = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 600 },
        );
        delivered++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(s.id);
      }
    }),
  );

  if (stale.length) await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, stale));
  if (delivered) {
    await db
      .update(schema.pushSubscriptions)
      .set({ lastUsedAt: new Date() })
      .where(inArray(schema.pushSubscriptions.userId, userIds));
  }
  return delivered;
}

/** Store or refresh a browser's push endpoint. */
export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string | null,
): Promise<void> {
  await db
    .insert(schema.pushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent ?? null },
    });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint));
}

/** Write in-app notifications and push them to the same users in one step. */
export async function notify(
  userIds: string[],
  type: (typeof schema.notificationType.enumValues)[number],
  message: PushMessage & { payload?: Record<string, unknown> },
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return;

  await db.insert(schema.notifications).values(
    unique.map((userId) => ({
      userId,
      type,
      title: message.title,
      body: message.body,
      payload: message.payload ?? {},
    })),
  );
  await sendPush(unique, message);
}
