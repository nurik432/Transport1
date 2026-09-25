/** Russian plural forms: "1 место", "2 места", "5 мест". */

/**
 * Picks the form matching `n`: [one, few, many].
 * Example: plural(n, ["место", "места", "мест"]).
 */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = abs % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** Free seats as shown to a passenger: "мест нет" / "1 место" / "8 мест". */
export function seatsLabel(free: number): string {
  if (free <= 0) return "мест нет";
  return `${free} ${plural(free, ["место", "места", "мест"])}`;
}
