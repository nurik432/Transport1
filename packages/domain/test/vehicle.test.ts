import { describe, expect, it } from "vitest";
import { vehicleLabel, vehicleTitle } from "../src/vehicle";

describe("vehicleLabel", () => {
  it("joins number and model", () => {
    expect(vehicleLabel({ number: "7776TT02", model: "Спринтер" })).toBe("7776TT02 · Спринтер");
  });

  it("shows only the number when the model is empty or missing", () => {
    expect(vehicleLabel({ number: "7776TT02", model: "" })).toBe("7776TT02");
    expect(vehicleLabel({ number: "7776TT02", model: "  " })).toBe("7776TT02");
    expect(vehicleLabel({ number: "7776TT02", model: null })).toBe("7776TT02");
  });
});

describe("vehicleTitle", () => {
  it("puts the model first", () => {
    expect(vehicleTitle({ number: "7779", model: "Дамас" })).toBe("Дамас, 7779");
  });

  it("shows only the number when the model is empty", () => {
    expect(vehicleTitle({ number: "7779", model: "" })).toBe("7779");
  });
});
