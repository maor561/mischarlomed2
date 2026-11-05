import { body, handle, intParam } from "@/lib/api";
import { advance, UserError } from "@/lib/engine/service";

/** מכונת זמן: קידום עד תאריך. הממשק המלא (+יום/+שבוע ואירועים) ייבנה בחבילה 3 */
export const POST = (req: Request, ctx: RouteContext<"/api/portfolios/[id]/advance">) =>
  handle(async () => {
    const b = await body<{ to: string }>(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.to ?? "")) throw new UserError("תאריך לא תקין");
    return advance(intParam((await ctx.params).id), b.to);
  });
