import { headers } from "next/headers";

/**
 * Public origin of the site: APP_URL when set, else the request's own host.
 * Used where a link must be absolute (QR codes, og:image).
 */
export async function appOrigin(): Promise<string> {
  const fromEnv = process.env.APP_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
