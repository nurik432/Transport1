"use client";

import { useEffect } from "react";
import { readNotifications } from "../actions";

/** Clears the unread badge once the list has been seen. */
export function MarkReadOnView({ hasUnread }: { hasUnread: boolean }) {
  useEffect(() => {
    if (!hasUnread) return;
    const id = setTimeout(() => void readNotifications(), 800);
    return () => clearTimeout(id);
  }, [hasUnread]);
  return null;
}
