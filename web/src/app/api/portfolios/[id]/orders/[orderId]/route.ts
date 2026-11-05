import { handle, intParam } from "@/lib/api";
import { cancelOrder } from "@/lib/engine/service";

export const DELETE = (_: Request, ctx: RouteContext<"/api/portfolios/[id]/orders/[orderId]">) =>
  handle(async () => {
    const { id, orderId } = await ctx.params;
    await cancelOrder(intParam(id), intParam(orderId));
    return { ok: true };
  });
