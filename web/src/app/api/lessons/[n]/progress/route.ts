import { body, handle, intParam } from "@/lib/api";
import { setProgress } from "@/lib/lessons/progress";

export const POST = (req: Request, ctx: RouteContext<"/api/lessons/[n]/progress">) =>
  handle(async () => {
    const n = intParam((await ctx.params).n);
    await setProgress(n, await body<{ quiz?: boolean; mission?: boolean; note?: string | null }>(req));
    return { ok: true };
  });
