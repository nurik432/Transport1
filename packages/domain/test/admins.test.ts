import { describe, expect, it } from "vitest";
import { canManageUser } from "../src/admins";

const admin = { id: "a1", isSuper: false };
const sup = { id: "s1", isSuper: true };

describe("canManageUser", () => {
  it("lets any admin manage drivers and passengers", () => {
    for (const role of ["driver", "passenger"] as const) {
      expect(canManageUser(admin, { id: "u", role, isSuper: false })).toBe(true);
      expect(canManageUser(sup, { id: "u", role, isSuper: false })).toBe(true);
    }
  });

  it("forbids an ordinary admin from managing any admin", () => {
    expect(canManageUser(admin, { id: "a2", role: "admin", isSuper: false })).toBe(false);
    expect(canManageUser(admin, { id: "s1", role: "admin", isSuper: true })).toBe(false);
  });

  it("lets the superadmin manage an ordinary admin", () => {
    expect(canManageUser(sup, { id: "a1", role: "admin", isSuper: false })).toBe(true);
  });

  it("protects the superadmin from everyone, including themselves", () => {
    expect(canManageUser(sup, { id: "s1", role: "admin", isSuper: true })).toBe(false);
    expect(canManageUser(sup, { id: "s2", role: "admin", isSuper: true })).toBe(false);
  });
});
