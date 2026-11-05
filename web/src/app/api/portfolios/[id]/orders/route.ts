import { body, handle, intParam } from "@/lib/api";
import type { OrderInput } from "@/lib/engine/process";
import { placeOrder } from "@/lib/engine/service";

export const POST = (req: Request, ctx: RouteContext<"/api/portfolios/[id]/orders">) =>
  handle(async () => placeOrder(intParam((await ctx.params).id), await body<OrderInput>(req)));
