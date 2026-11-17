import { connection } from "next/server";
import { body, handleFor, intParam } from "@/lib/api";
import { setWatch } from "@/lib/engine/service";
import { watchView } from "@/lib/store/store";

type Ctx = RouteContext<"/api/portfolios/[id]/watch">;

/** רשימת המעקב עם מחירים ביום הסימולציה */
export const GET = async (_req: Request, ctx: Ctx) => {
  await connection();
  const id = intParam((await ctx.params).id);
  return handleFor(id, () => watchView(id));
};

/** ☆ הוספה (on=true) או הסרה */
export const POST = async (req: Request, ctx: Ctx) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, async () => {
    const b = await body<{ symbol: string; on: boolean }>(req);
    return setWatch(id, String(b.symbol), !!b.on);
  });
};
