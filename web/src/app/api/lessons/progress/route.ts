import { connection } from "next/server";
import { handle } from "@/lib/api";
import { getProgress } from "@/lib/lessons/progress";

// דינמי תמיד: בלי זה Next.js מנסה לבנות את התשובה מראש בזמן ה-build
export const GET = async () => {
  await connection();
  return handle(getProgress);
};
