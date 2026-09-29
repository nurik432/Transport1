/** Who may manage whom. Only the superadmin manages other admins. */

export interface ManageActor {
  id: string;
  isSuper: boolean;
}

export interface ManageTarget {
  id: string;
  role: "passenger" | "driver" | "admin";
  isSuper: boolean;
}

/**
 * Block, unblock or reset the password of `target`. Any admin manages drivers
 * and passengers. Admins are managed by the superadmin alone, and the superadmin
 * can be neither blocked nor changed by anyone (including themselves here:
 * their own password goes through the ordinary "change password" form).
 */
export function canManageUser(actor: ManageActor, target: ManageTarget): boolean {
  if (target.role !== "admin") return true;
  if (!actor.isSuper) return false;
  return target.id !== actor.id && !target.isSuper;
}
