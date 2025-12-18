import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { COOKIE_NAME } from "@/lib/auth";

async function getUser(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    return payload as any;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const needsLogin =
    pathname.startsWith("/player") ||
    pathname.startsWith("/manager") ||
    pathname.startsWith("/display");

  if (!needsLogin) return NextResponse.next();

  const user = await getUser(req);
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/manager") && user.role !== "manager") {
    return NextResponse.redirect(new URL("/player", req.url));
  }
  if (pathname.startsWith("/display") && user.role !== "display") {
    return NextResponse.redirect(new URL("/player", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/player/:path*", "/manager/:path*", "/display/:path*"],
};
