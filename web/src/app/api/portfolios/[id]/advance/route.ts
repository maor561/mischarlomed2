import { body, handleFor, intParam } from "@/lib/api";
import { advanceUntil, UserError, type StopPrefs } from "@/lib/engine/service";

/**
 * מכונת זמן: מתקדם עד days ימים קדימה, ועוצר מוקדם יותר אם מתקיים תנאי עצירה.
 * מקבלים מספר ימים ולא תאריך, כדי שגם במסע עיוור הלקוח לא יצטרך לדעת את התאריך.
 */
export const POST = async (req: Request, ctx: RouteContext<"/api/portfolios/[id]/advance">) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, async () => {
    const b = await body<{ days: number; stops?: StopPrefs }>(req);
    if (!Number.isFinite(b.days)) throw new UserError("מספר ימים לא תקין");
    return advanceUntil(id, b.days, b.stops ?? {});
  });
};
