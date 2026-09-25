import { describe, expect, it } from "vitest";
import { plural, seatsLabel } from "../src/plural";

const SEAT = ["место", "места", "мест"] as [string, string, string];

describe("plural", () => {
  it("uses the singular form for 1, 21, 101", () => {
    for (const n of [1, 21, 101, 131]) expect(plural(n, SEAT)).toBe("место");
  });

  it("uses the few form for 2-4, 22-24", () => {
    for (const n of [2, 3, 4, 22, 104]) expect(plural(n, SEAT)).toBe("места");
  });

  it("uses the many form for 5-20 and the teens", () => {
    for (const n of [0, 5, 11, 12, 13, 14, 19, 25, 111]) expect(plural(n, SEAT)).toBe("мест");
  });
});

describe("seatsLabel", () => {
  it("counts free seats", () => {
    expect(seatsLabel(1)).toBe("1 место");
    expect(seatsLabel(3)).toBe("3 места");
    expect(seatsLabel(8)).toBe("8 мест");
  });

  it("says there are none left at zero", () => {
    expect(seatsLabel(0)).toBe("мест нет");
  });
});
