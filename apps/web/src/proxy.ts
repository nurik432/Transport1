import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "transport_session";

/**
 * Optimistic gate only: redirects anonymous visitors to /login.
 * Real role checks happen in each zone's layout (see lib/auth.ts).
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (!hasSession && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Keep the query too: a QR link carries its point token there.
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Icons, the og:image and the logo must load without a session: the login
  // screen and link previews in messengers fetch them anonymously.
  matcher: [
    "/((?!_next/static|_next/image|favicon|icon-|apple-touch-icon|og-image|brand/|manifest.webmanifest|api/).*)",
  ],
};
