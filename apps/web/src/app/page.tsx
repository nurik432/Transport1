import { redirect } from "next/navigation";
import { HOME_BY_ROLE, getSessionUser } from "@/lib/auth";

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? HOME_BY_ROLE[user.role] : "/login");
}
