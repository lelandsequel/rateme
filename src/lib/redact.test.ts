import { describe, it, expect } from "vitest";
import { publicRater, fullRater, canSeeFullRater } from "./redact";

const FAKE_RATER = {
  userId: "u1",
  user: {
    id: "u1",
    name: "Real Name Should Not Leak",
    email: "secret@example.com",
    state: "TX",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  title: "VP of Procurement",
  company: "ProCureCo",
  industry: { slug: "industrial-equipment", name: "Industrial Equipment" },
};

describe("publicRater", () => {
  it("strips name and email", () => {
    const r = publicRater(FAKE_RATER);
    expect(r).not.toHaveProperty("name");
    expect(r).not.toHaveProperty("email");
    expect(JSON.stringify(r)).not.toContain("Real Name");
    expect(JSON.stringify(r)).not.toContain("secret@example.com");
  });
  it("keeps title, company, industry, state, userId", () => {
    const r = publicRater(FAKE_RATER);
    expect(r.title).toBe("VP of Procurement");
    expect(r.company).toBe("ProCureCo");
    expect(r.industry.slug).toBe("industrial-equipment");
    expect(r.state).toBe("TX");
    expect(r.userId).toBe("u1");
  });
});

describe("fullRater", () => {
  it("includes name and email (for self / admin / managing-manager only)", () => {
    const r = fullRater(FAKE_RATER);
    expect(r.name).toBe("Real Name Should Not Leak");
    expect(r.email).toBe("secret@example.com");
  });
});

describe("canSeeFullRater", () => {
  it("allows self", () => {
    expect(canSeeFullRater({ viewerId: "u1", viewerRole: "RATER", raterUserId: "u1" })).toBe(true);
  });
  it("allows admin", () => {
    expect(canSeeFullRater({ viewerId: "anyone", viewerRole: "ADMIN", raterUserId: "u1" })).toBe(true);
  });
  it("allows the rater-manager that manages this rater", () => {
    expect(
      canSeeFullRater({
        viewerId: "mgr-1",
        viewerRole: "RATER_MANAGER",
        raterUserId: "u1",
        managerOfRaterUserIds: ["u1", "u2"],
      }),
    ).toBe(true);
  });
  it("denies a rep viewing a rater (even a connected one)", () => {
    expect(canSeeFullRater({ viewerId: "rep-1", viewerRole: "REP", raterUserId: "u1" })).toBe(false);
  });
  it("denies a rater-manager that doesn't manage this rater", () => {
    expect(
      canSeeFullRater({
        viewerId: "mgr-2",
        viewerRole: "RATER_MANAGER",
        raterUserId: "u1",
        managerOfRaterUserIds: ["u9"],
      }),
    ).toBe(false);
  });
  it("denies a sales-manager (they manage reps, not raters)", () => {
    expect(canSeeFullRater({ viewerId: "sm-1", viewerRole: "SALES_MANAGER", raterUserId: "u1" })).toBe(false);
  });
});
