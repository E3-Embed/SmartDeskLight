import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic auth. Inactive unless both variables are set, so local
 * development stays open. Put the dashboard behind HTTPS when you enable it.
 */
const USER = process.env.DASHBOARD_USER;
const PASSWORD = process.env.DASHBOARD_PASSWORD;

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="SmartDeskLight", charset="UTF-8"',
    },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function middleware(request: NextRequest) {
  if (!USER || !PASSWORD) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("basic ")) return unauthorized();

  let decoded = "";
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return unauthorized();
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) return unauthorized();

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  if (!safeEqual(user, USER) || !safeEqual(password, PASSWORD)) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
