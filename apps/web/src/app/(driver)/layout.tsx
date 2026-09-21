import { requireRole } from "@/lib/auth";
import { countUnread } from "@/lib/queries";
import { DriverNav } from "./nav";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("driver");
  const unread = await countUnread(user.id);

  return (
    <div className="min-h-dvh pb-20">
      {children}
      <DriverNav unread={unread} />
    </div>
  );
}
