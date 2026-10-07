/**
 * A passenger's standing booking ("ride this departure every day") and the
 * pause that suspends it for a holiday or sick leave. The pause belongs to the
 * passenger, not to one departure: being away covers morning and evening alike.
 */
import { addDays, formatLocalDate } from "./time";

/** Longer than this is not a pause any more — the passenger should detach instead. */
export const MAX_PAUSE_DAYS = 60;

/** Inclusive range of YYYY-MM-DD dates; a pause exists only when both ends are set. */
export interface RidePause {
  from: string | null;
  to: string | null;
}

export type PauseState = "none" | "scheduled" | "active" | "expired";

/** Whether rides are suspended on this date. Dates compare as strings: YYYY-MM-DD sorts correctly. */
export function isPausedOn(pause: RidePause, date: string): boolean {
  if (!pause.from || !pause.to) return false;
  return date >= pause.from && date <= pause.to;
}

export function pauseState(pause: RidePause, today: string): PauseState {
  if (!pause.from || !pause.to) return "none";
  if (today < pause.from) return "scheduled";
  return today <= pause.to ? "active" : "expired";
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Why this pause cannot be saved, or null when it can. */
export function validatePause(from: string, to: string, today: string): string | null {
  if (!isDate(from) || !isDate(to)) return "Укажите обе даты";
  if (to < from) return "Дата окончания раньше даты начала";
  if (to < today) return "Этот период уже прошёл";
  if (to > addDays(from, MAX_PAUSE_DAYS - 1)) {
    return `Пауза не длиннее ${MAX_PAUSE_DAYS} дней. Если не ездите дольше — отвяжитесь от рейса`;
  }
  return null;
}

/** "Пауза до 14 октября" while it runs, "Пауза с 20 по 31 октября" before it starts; null when there is nothing to say. */
export function pauseLabel(pause: RidePause, today: string): string | null {
  const state = pauseState(pause, today);
  if (state === "none" || state === "expired") return null;
  const from = pause.from!;
  const to = pause.to!;
  if (state === "active") return `Пауза до ${formatLocalDate(to)}`;
  if (from === to) return `Пауза ${formatLocalDate(from)}`;
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const start = sameMonth ? String(Number(from.slice(8))) : formatLocalDate(from);
  return `Пауза с ${start} по ${formatLocalDate(to)}`;
}
