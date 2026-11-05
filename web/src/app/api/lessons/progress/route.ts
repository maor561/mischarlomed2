import { handle } from "@/lib/api";
import { getProgress } from "@/lib/lessons/progress";

export const GET = () => handle(getProgress);
