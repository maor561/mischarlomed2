import { handleFor, intParam } from "@/lib/api";
import { stockPage } from "@/lib/stock";

export const GET = async (_: Request, ctx: RouteContext<"/api/portfolios/[id]/stock/[symbol]">) => {
  const { id: raw, symbol } = await ctx.params;
  const id = intParam(raw);
  return handleFor(id, () => stockPage(id, decodeURIComponent(symbol)));
};
