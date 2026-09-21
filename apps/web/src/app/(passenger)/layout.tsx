import { requireRole } from "@/lib/auth";
import { countUnread } from "@/lib/queries";
import { PassengerNav } from "./nav";

export default async function PassengerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("passenger");
  const unread = await countUnread(user.id);

  return (
    <div className="min-h-dvh pb-20">
      {children}
      <PassengerNav unread={unread} />
    </div>
  );
}
