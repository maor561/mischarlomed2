import { body, handleFor, intParam } from "@/lib/api";
import type { OrderInput } from "@/lib/engine/process";
import { placeOrder } from "@/lib/engine/service";

export const POST = async (req: Request, ctx: RouteContext<"/api/portfolios/[id]/orders">) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, async () => placeOrder(id, await body<OrderInput>(req)));
};
