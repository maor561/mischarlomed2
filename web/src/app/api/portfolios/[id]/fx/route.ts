import { body, handle, intParam } from "@/lib/api";
import { convertCash, UserError } from "@/lib/engine/service";

export const POST = (req: Request, ctx: RouteContext<"/api/portfolios/[id]/fx">) =>
  handle(async () => {
    const b = await body<{ from: string; amount: number }>(req);
    if (b.from !== "ILS" && b.from !== "USD") throw new UserError("מטבע לא תקין");
    return convertCash(intParam((await ctx.params).id), b.from, Number(b.amount));
  });
