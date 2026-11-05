import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_DAYS, checkPassword, createSession } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const next = String(formData.get("next") || "/");
  if (!(await checkPassword(String(formData.get("password") ?? "")))) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  (await cookies()).set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

async function Fields({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <>
      <input type="hidden" name="next" value={next} />
      {sp.error === "1" && <p className="text-sm text-down">הסיסמה שגויה</p>}
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <form action={login} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-bold">📈 מסחר־לומד</h1>
          <p className="text-sm text-muted">סימולטור השקעות עם נתונים אמיתיים וכסף וירטואלי</p>
        </div>
        <label className="block">
          <span className="text-sm text-muted">סיסמה</span>
          <input name="password" type="password" autoFocus required className="input mt-1" />
        </label>
        <Suspense>
          <Fields searchParams={searchParams} />
        </Suspense>
        <button className="btn w-full">כניסה</button>
      </form>
    </main>
  );
}
