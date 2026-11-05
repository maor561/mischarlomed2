import { appIcon } from "@/lib/app-icon";

// אייפון/אייפד: "הוסף למסך הבית" משתמש באייקון הזה (בלי שקיפות ובלי עיגול, iOS מעגל לבד)
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function AppleIcon() {
  return appIcon(180, true);
}
