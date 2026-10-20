import { getLockState, requireUser } from "@/lib/auth";
import { LockGuard } from "@/components/lock-guard";

/**
 * The QR link lands here for any signed-in role, so it lives outside the
 * driver zone (whose layout would bounce a passenger away before the page
 * could explain). The PIN lock still applies.
 */
export default async function CheckinLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const lock = await getLockState();
  return (
    <LockGuard pinSet={lock.pinSet} serverLocked={lock.locked} remember={lock.remember}>
      <div className="min-h-dvh">{children}</div>
    </LockGuard>
  );
}
