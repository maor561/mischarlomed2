import { body, handleFor, intParam } from "@/lib/api";
import { deletePlan, setPlanStatus, upsertPlan, UserError, type PlanInput } from "@/lib/engine/service";

type Ctx = RouteContext<"/api/portfolios/[id]/plans">;

/** יצירה (בלי id) או עריכה של תוכנית השקעה קבועה */
export const POST = async (req: Request, ctx: Ctx) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, async () => upsertPlan(id, await body<PlanInput>(req)));
};

/** השהיה או הפעלה מחדש */
export const PATCH = async (req: Request, ctx: Ctx) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, async () => {
    const b = await body<{ planId: number; status: string }>(req);
    if (b.status !== "active" && b.status !== "paused") throw new UserError("מצב לא תקין");
    await setPlanStatus(id, Number(b.planId), b.status);
    return { ok: true };
  });
};

export const DELETE = async (req: Request, ctx: Ctx) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, async () => {
    await deletePlan(id, Number((await body<{ planId: number }>(req)).planId));
    return { ok: true };
  });
};
