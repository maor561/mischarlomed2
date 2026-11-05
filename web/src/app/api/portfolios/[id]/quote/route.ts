import { body, handle, intParam } from "@/lib/api";
import type { OrderInput } from "@/lib/engine/process";
import { quoteForOrder } from "@/lib/engine/service";

/** הערכת עלות לפקודה לפני השליחה */
export const POST = (req: Request, ctx: RouteContext<"/api/portfolios/[id]/quote">) =>
  handle(async () => quoteForOrder(intParam((await ctx.params).id), await body<Pick<OrderInput, "side" | "symbol" | "qty" | "type" | "price">>(req)));
