import { describe, expect, it } from "vitest";
import { assertCanDelete, assertCanEdit, maskDeletedBody } from "../src/community/service.js";

describe("assertCanEdit (owner only)", () => {
  it("allows the comment owner to edit", () => {
    expect(() => assertCanEdit({ commentUserId: "u1", requestUserId: "u1" })).not.toThrow();
  });

  it("throws 403 when caller is not the owner", () => {
    expect(() => assertCanEdit({ commentUserId: "u1", requestUserId: "u2" })).toThrow(/forbidden/i);
  });

  it("throws 403 when caller is admin but not the owner", () => {
    expect(() =>
      assertCanEdit({ commentUserId: "u1", requestUserId: "admin-id", role: "admin" }),
    ).toThrow(/forbidden/i);
  });
});

describe("assertCanDelete (owner OR admin)", () => {
  it("allows the comment owner to delete", () => {
    expect(() =>
      assertCanDelete({ commentUserId: "u1", requestUserId: "u1", role: "user" }),
    ).not.toThrow();
  });

  it("allows an admin to delete any comment", () => {
    expect(() =>
      assertCanDelete({ commentUserId: "u1", requestUserId: "admin-id", role: "admin" }),
    ).not.toThrow();
  });

  it("throws 403 when a non-owner non-admin tries to delete", () => {
    expect(() =>
      assertCanDelete({ commentUserId: "u1", requestUserId: "u2", role: "user" }),
    ).toThrow(/forbidden/i);
  });
});

describe("maskDeletedBody", () => {
  it("returns the original body when deletedAt is null", () => {
    expect(maskDeletedBody("hello", null)).toBe("hello");
  });

  it("replaces body with '[đã xóa]' when deletedAt is set", () => {
    expect(maskDeletedBody("hello", new Date())).toBe("[đã xóa]");
  });

  it("still returns '[đã xóa]' even when the original body is empty", () => {
    expect(maskDeletedBody("", new Date())).toBe("[đã xóa]");
  });
});
