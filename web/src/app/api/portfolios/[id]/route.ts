import { handle, handleFor, intParam } from "@/lib/api";
import { deletePortfolio, view } from "@/lib/engine/service";

type Ctx = RouteContext<"/api/portfolios/[id]">;

export const GET = async (_: Request, ctx: Ctx) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, () => view(id));
};

export const DELETE = (_: Request, ctx: Ctx) =>
  handle(async () => {
    await deletePortfolio(intParam((await ctx.params).id));
    return { ok: true };
  });
