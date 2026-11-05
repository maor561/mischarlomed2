import { body, handle } from "@/lib/api";
import { createPortfolio, listPortfolios, type CreateInput } from "@/lib/engine/service";
import { mask } from "@/lib/timemachine/journey";

// כל תיק מוסתר בנפרד, לפי תאריך ההתחלה שלו
export const GET = () => handle(async () => (await listPortfolios()).map((p) => mask(p, p)));

export const POST = (req: Request) =>
  handle(async () => ({ id: await createPortfolio(await body<CreateInput>(req)) }));
