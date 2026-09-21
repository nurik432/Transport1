"use client";

import { useTransition } from "react";
import { cx } from "./ui";
import { IconStar } from "./icons";
import { toggleFavorite } from "@/app/(passenger)/app/actions";

export function FavoriteButton({ kind, id, active }: { kind: "route" | "stop"; id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={active}
      aria-label={active ? "Убрать из избранного" : "Добавить в избранное"}
      onClick={() => start(() => toggleFavorite(kind, id))}
      className={cx(
        "flex size-10 cursor-pointer items-center justify-center rounded-lg transition-colors duration-200",
        active ? "text-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <IconStar className={cx("size-5", active && "fill-current")} />
    </button>
  );
}
