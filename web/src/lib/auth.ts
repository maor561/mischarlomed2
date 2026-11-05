/**
 * כניסה למשתמש יחיד: סיסמה מ-APP_PASSWORD ועוגייה חתומה ב-HMAC (SESSION_SECRET).
 * משתמש ב-Web Crypto, ולכן עובד גם ב-proxy וגם בשרת.
 */
export const SESSION_COOKIE = "sim_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("חסר SESSION_SECRET (לפחות 16 תווים) בקובץ ‎.env.local");
  return s;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createSession(): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  return `${exp}.${await hmac(String(exp))}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(exp));
}

export async function checkPassword(input: string): Promise<boolean> {
  const pw = process.env.APP_PASSWORD;
  if (!pw) throw new Error("חסר APP_PASSWORD בקובץ ‎.env.local");
  // משווים גיבובים כדי שהזמן לא יחשוף את אורך הסיסמה
  return safeEqual(await hmac(`pw:${input}`), await hmac(`pw:${pw}`));
}
