import { connection } from "next/server";
import { body, handle } from "@/lib/api";
import { createPortfolio, listPortfolios, type CreateInput } from "@/lib/engine/service";
import { mask } from "@/lib/timemachine/journey";

// כל תיק מוסתר בנפרד, לפי תאריך ההתחלה שלו. דינמי תמיד (לא נבנה מראש)
export const GET = async () => {
  await connection();
  return handle(async () => (await listPortfolios()).map((p) => mask(p, p)));
};

export const POST = (req: Request) =>
  handle(async () => ({ id: await createPortfolio(await body<CreateInput>(req)) }));
