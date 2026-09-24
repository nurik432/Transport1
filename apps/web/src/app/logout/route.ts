import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";

// Relative Location: behind a proxy (Dokku nginx, Tailscale Funnel) request.url
// is the container's own address (http://0.0.0.0:3000), not the public host.
function toLogin(status: 303 | 307) {
  return new NextResponse(null, { status, headers: { Location: "/login" } });
}

export async function POST() {
  await logout();
  return toLogin(303);
}

/**
 * Same effect via GET: a Server Component can't clear cookies itself, so
 * requireUser()/page.tsx redirect a stale/invalid session cookie here to
 * clear it before landing on /login (otherwise proxy.ts, which only checks
 * cookie presence, bounces it straight back and loops).
 */
export async function GET() {
  await logout();
  return toLogin(307);
}
