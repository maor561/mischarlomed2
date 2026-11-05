import { body, handleFor, intParam } from "@/lib/api";
import { addNote } from "@/lib/mentor/journal";

export const POST = async (req: Request, ctx: RouteContext<"/api/portfolios/[id]/journal/note">) => {
  const id = intParam((await ctx.params).id);
  return handleFor(id, async () => {
    const b = await body<{ text: string; context?: string }>(req);
    await addNote(id, b.text, b.context ?? null);
    return { ok: true };
  });
};
