import { body, handleFor, intParam } from "@/lib/api";
import type { OrderInput } from "@/lib/engine/process";
import { quoteForOrder } from "@/lib/engine/service";

/** הערכת עלות לפקודה לפני השליחה */
export const POST = async (req: Request, ctx: RouteContext<"/api/portfolios/[id]/quote">) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, async () => quoteForOrder(id, await body<Pick<OrderInput, "side" | "symbol" | "qty" | "type" | "price">>(req)));
};
