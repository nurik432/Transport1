import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logout } from "@/lib/auth";

export async function POST(request: NextRequest) {
  await logout();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

/**
 * Same effect via GET: a Server Component can't clear cookies itself, so
 * requireUser()/page.tsx redirect a stale/invalid session cookie here to
 * clear it before landing on /login (otherwise proxy.ts, which only checks
 * cookie presence, bounces it straight back and loops).
 */
export async function GET(request: NextRequest) {
  await logout();
  return NextResponse.redirect(new URL("/login", request.url));
}
