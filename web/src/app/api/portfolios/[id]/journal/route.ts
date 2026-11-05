import { handleFor, intParam } from "@/lib/api";
import { journal } from "@/lib/mentor/journal";

/** יומן המסחר: עסקאות, בדיקות חוזרות, הערות ודפוסים */
export const GET = async (_: Request, ctx: RouteContext<"/api/portfolios/[id]/journal">) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, () => journal(id));
};
