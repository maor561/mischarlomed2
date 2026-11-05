import { loadPortfolio, UserError } from "./engine/service";
import { mask } from "./timemachine/journey";

/** עוטף route handler: שגיאת משתמש → 400 עם הודעה בעברית, כל השאר → 500 */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: `שגיאה בשרת: ${(e as Error).message}` }, { status: 500 });
  }
}

/** כמו handle, לתשובות של תיק מסוים: במסע עיוור התאריכים מוסתרים, גם בהודעות שגיאה */
export async function handleFor<T>(id: number, fn: () => Promise<T>): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(mask(await loadPortfolio(id), data));
  } catch (e) {
    const p = await loadPortfolio(id).catch(() => null);
    const msg = (e as Error).message;
    const masked = p ? mask(p, { error: msg }).error : msg;
    if (e instanceof UserError) return Response.json({ error: masked }, { status: 400 });
    console.error(e);
    return Response.json({ error: `שגיאה בשרת: ${masked}` }, { status: 500 });
  }
}

export function intParam(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new UserError("מזהה לא תקין");
  return n;
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new UserError("בקשה לא תקינה");
  }
}
