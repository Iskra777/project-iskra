import { describe, expect, it } from "vitest";
import { emailSchema, usernameSchema, passwordSchema } from "./validation";

describe("emailSchema", () => {
  it("lowercases a valid email", () => {
    expect(emailSchema.parse("User@Example.com")).toBe("user@example.com");
  });

  it("trims whitespace", () => {
    expect(emailSchema.parse("  user@example.com  ")).toBe("user@example.com");
  });

  it("rejects an invalid email", () => {
    expect(() => emailSchema.parse("not-an-email")).toThrow();
  });
});

describe("usernameSchema", () => {
  it("accepts a valid username", () => {
    expect(usernameSchema.parse("iskra_user1")).toBe("iskra_user1");
  });

  it("rejects too short", () => {
    expect(() => usernameSchema.parse("ab")).toThrow();
  });

  it("rejects too long", () => {
    expect(() => usernameSchema.parse("a".repeat(21))).toThrow();
  });

  it("rejects disallowed characters", () => {
    expect(() => usernameSchema.parse("user name!")).toThrow();
  });
});

describe("passwordSchema", () => {
  it("accepts a simple 8-character password (no forced complexity)", () => {
    expect(passwordSchema.parse("password")).toBe("password");
  });

  it("rejects too short", () => {
    expect(() => passwordSchema.parse("short1")).toThrow();
  });

  it("rejects too long", () => {
    expect(() => passwordSchema.parse("a".repeat(129))).toThrow();
  });
});
