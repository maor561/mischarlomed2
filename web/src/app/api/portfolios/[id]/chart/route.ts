import { handleFor, intParam } from "@/lib/api";
import { UserError } from "@/lib/engine/service";
import { instrumentChart } from "@/lib/timemachine/journey";

/** גרף נייר עד יום הסימולציה, בלי הצצה לעתיד */
export const GET = async (req: Request, ctx: RouteContext<"/api/portfolios/[id]/chart">) => {
  const id = intParam((await ctx.params).id);
  const sp = new URL(req.url).searchParams;
  return handleFor(id, async () => {
    const symbol = sp.get("symbol");
    if (!symbol) throw new UserError("חסר נייר");
    return instrumentChart(id, symbol, Number(sp.get("days") ?? 365));
  });
};
