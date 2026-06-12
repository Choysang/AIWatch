// Edge middleware (Slice 8): mint the anonymous reader-identity cookie on first visit
// so the SSR feed and the reactions API see the same `rid` on the very first POST.
// Runs only on reader pages — admin/auth/static assets are excluded by the matcher
// because they don't need anonymous reactions and we don't want to leak the cookie
// onto static asset responses.

import { NextResponse, type NextRequest } from "next/server";
import {
  READER_ID_COOKIE,
  READER_ID_MAX_AGE_SECONDS,
  mintReaderId,
  verifyReaderId,
} from "@/auth/reader-id";

export async function middleware(req: NextRequest) {
  const existing = req.cookies.get(READER_ID_COOKIE)?.value;
  if (existing && (await verifyReaderId(existing))) {
    return NextResponse.next();
  }
  const token = await mintReaderId();
  const res = NextResponse.next();
  res.cookies.set({
    name: READER_ID_COOKIE,
    value: token,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: READER_ID_MAX_AGE_SECONDS,
  });
  return res;
}

// Match reader-facing routes only. Excludes _next/* (assets), api/* (no SSR cookie
// minting on POSTs), and the admin/login surfaces. The reactions endpoint reads the
// cookie but does not mint one — middleware on the SSR navigation just before is
// what plants it.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|%5Fadmin|login).*)"],
};
