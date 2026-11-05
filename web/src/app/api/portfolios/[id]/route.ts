import { handle, intParam } from "@/lib/api";
import { deletePortfolio, view } from "@/lib/engine/service";

type Ctx = RouteContext<"/api/portfolios/[id]">;

export const GET = (_: Request, ctx: Ctx) => handle(async () => view(intParam((await ctx.params).id)));

export const DELETE = (_: Request, ctx: Ctx) =>
  handle(async () => {
    await deletePortfolio(intParam((await ctx.params).id));
    return { ok: true };
  });
