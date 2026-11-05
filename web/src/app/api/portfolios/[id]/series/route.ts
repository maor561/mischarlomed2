import { handleFor, intParam } from "@/lib/api";
import { journeySeries } from "@/lib/timemachine/journey";

/** שווי התיק מול המדד לאורך המסע (רק עד יום הסימולציה) */
export const GET = async (_: Request, ctx: RouteContext<"/api/portfolios/[id]/series">) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, () => journeySeries(id));
};
