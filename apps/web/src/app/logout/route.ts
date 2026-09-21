import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { logout } from "@/lib/auth";

export async function POST(request: NextRequest) {
  await logout();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
