import { appIcon } from "@/lib/app-icon";

const SIZES: Record<string, [number, boolean]> = { "192": [192, false], "512": [512, false], maskable: [512, true] };

export async function GET(_: Request, ctx: RouteContext<"/icons/[size]">) {
  const s = SIZES[(await ctx.params).size];
  if (!s) return new Response("not found", { status: 404 });
  return appIcon(s[0], s[1]);
}
