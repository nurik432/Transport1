import { requireRole } from "@/lib/auth";

/** Bare pages meant for paper: no sidebar, no navigation, admin only. */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin");
  return <div className="min-h-dvh bg-white text-black">{children}</div>;
}
