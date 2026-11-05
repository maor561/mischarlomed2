import { body, handle } from "@/lib/api";
import { createPortfolio, listPortfolios, type CreateInput } from "@/lib/engine/service";

export const GET = () => handle(listPortfolios);

export const POST = (req: Request) =>
  handle(async () => ({ id: await createPortfolio(await body<CreateInput>(req)) }));
