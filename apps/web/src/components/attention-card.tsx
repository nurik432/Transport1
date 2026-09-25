import Link from "next/link";
import type { AttentionAction, AttentionItem } from "@/lib/attention";
import { Panel, cx } from "./ui";

const TAG_TONE = {
  danger: "bg-danger-soft text-danger-foreground",
  warn: "bg-warn-soft text-warn-foreground",
} as const;

const ACTION_BASE =
  "inline-flex min-h-9 cursor-pointer items-center rounded-lg px-3 text-[13px] transition-colors duration-200";

function Action({ action }: { action: AttentionAction }) {
  const cls = cx(
    ACTION_BASE,
    action.primary ? "bg-primary font-bold text-on-primary hover:bg-primary-hover" : "font-semibold text-primary hover:bg-primary-soft",
  );
  if (action.external) {
    return (
      <a href={action.href} className={cls}>
        {action.label}
      </a>
    );
  }
  return (
    <Link href={action.href} className={cls}>
      {action.label}
    </Link>
  );
}

/**
 * One problem, one card: what happened, how bad it is, and the button that
 * starts fixing it. The ring colour repeats the tag, so a glance across the
 * row is enough to find the urgent one.
 */
export function AttentionCard({ item }: { item: AttentionItem }) {
  return (
    <Panel tone={item.tone} className="flex flex-col gap-2.5 p-4">
      <span className={cx("self-start rounded-md px-2 py-0.5 text-xs font-bold", TAG_TONE[item.tone])}>{item.tag}</span>
      <h3 className="text-base font-bold">{item.title}</h3>
      <p className="text-sm leading-snug text-muted-foreground">{item.details}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {item.actions.map((a) => (
          <Action key={a.href + a.label} action={a} />
        ))}
      </div>
    </Panel>
  );
}
