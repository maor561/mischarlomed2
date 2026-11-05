import { body, handleFor, intParam } from "@/lib/api";
import { saveReview, type Rating } from "@/lib/mentor/journal";

export const POST = async (req: Request, ctx: RouteContext<"/api/portfolios/[id]/journal/review">) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, async () => {
    const b = await body<{ orderId: number; rating: Rating; lesson?: string }>(req);
    await saveReview(id, Number(b.orderId), b.rating, b.lesson ?? null);
    return { ok: true };
  });
};
