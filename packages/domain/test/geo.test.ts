import { describe, expect, it } from "vitest";
import { distanceMeters, formatMinutes, parseTimeToMinutes } from "../src";

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters({ lat: 40.28, lng: 69.63 }, { lat: 40.28, lng: 69.63 })).toBe(0);
  });
  it("approximates 1 degree of latitude as ~111 km", () => {
    const d = distanceMeters({ lat: 40, lng: 69 }, { lat: 41, lng: 69 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("time helpers", () => {
  it("parses and formats", () => {
    expect(parseTimeToMinutes("07:30")).toBe(450);
    expect(parseTimeToMinutes("07:30:00")).toBe(450);
    expect(formatMinutes(450)).toBe("07:30");
    expect(formatMinutes(1445)).toBe("00:05");
  });
  it("rejects invalid input", () => {
    expect(() => parseTimeToMinutes("25:00")).toThrow();
    expect(() => parseTimeToMinutes("abc")).toThrow();
  });
});
