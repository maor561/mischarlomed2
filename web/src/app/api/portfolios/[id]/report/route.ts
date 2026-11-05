import { handleFor, intParam } from "@/lib/api";
import { journeyReport } from "@/lib/timemachine/journey";

/** דו"ח המסע (באמצע: דו"ח ביניים) */
export const GET = async (_: Request, ctx: RouteContext<"/api/portfolios/[id]/report">) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, () => journeyReport(id));
};
