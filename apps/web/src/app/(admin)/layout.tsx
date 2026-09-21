import { requireRole } from "@/lib/auth";
import { AdminSidebar } from "./sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin");

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AdminSidebar userName={user.name} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
