import { connection } from "next/server";
import { body, handleFor, intParam } from "@/lib/api";
import { buyCollection, storeView } from "@/lib/store/store";

type Ctx = RouteContext<"/api/portfolios/[id]/store">;

export const GET = async (_req: Request, ctx: Ctx) => {
  await connection();
  const id = intParam((await ctx.params).id);
  return handleFor(id, () => storeView(id));
};

/** קנייה של אוסף שלם בחלוקה שווה */
export const POST = async (req: Request, ctx: Ctx) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, async () => {
    const b = await body<{ collection: string; amount: number }>(req);
    return buyCollection(id, String(b.collection), Number(b.amount));
  });
};
