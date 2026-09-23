import { redirect } from "next/navigation";
import { HOME_BY_ROLE, getSessionUser } from "@/lib/auth";

export default async function RootPage() {
  const user = await getSessionUser();
  // A stale/invalid session cookie reaches here too (proxy.ts only checks
  // presence) — /logout clears it before landing on /login.
  redirect(user ? HOME_BY_ROLE[user.role] : "/logout");
}
