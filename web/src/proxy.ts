import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "לא מחובר" }, { status: 401 });
  }
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // קבצי האפליקציה (מניפסט, אייקונים, sw.js) פתוחים בלי כניסה, כדי שהטלפון יוכל להתקין אותה
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest|sw.js).*)"],
};
