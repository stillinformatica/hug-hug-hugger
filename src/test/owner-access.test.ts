import { describe, it, expect } from "vitest";
import { canAdminister } from "../../supabase/functions/_shared/access-rules";

describe("owner administration", () => {
  it("allows only the designated owner after MFA", () => {
    expect(canAdminister("1ed2a250-7ad8-4fcd-9567-763a3f6e5540", true, "aal2")).toBe(true);
    expect(canAdminister("0321f7a9-87ef-421f-b25a-c4273232a526", true, "aal2")).toBe(false);
  });
  it("requires a second authentication factor", () => {
    expect(canAdminister("1ed2a250-7ad8-4fcd-9567-763a3f6e5540", true, "aal1")).toBe(false);
  });
  it("cannot grant access without a protected admin role", () => {
    expect(canAdminister("1ed2a250-7ad8-4fcd-9567-763a3f6e5540", false, "aal2")).toBe(false);
  });
});