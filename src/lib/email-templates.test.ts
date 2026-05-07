/**
 * Tests for email template builders.
 *
 * We don't render full HTML — we just assert the EmailMessage shape, that
 * subjects mention the right name, that html and text are non-empty, and
 * that user-controlled strings are HTML-escaped.
 */

import { describe, it, expect } from "vitest";

import {
  escapeHtml,
  repHighlight,
  raterHighlight,
  managerHighlight,
  type TeamRow,
} from "./email-templates";
import type { RatingForAgg } from "./aggregates";

function rating(overrides: Partial<RatingForAgg> = {}): RatingForAgg {
  return {
    responsiveness: 5,
    productKnowledge: 5,
    followThrough: 5,
    listeningNeedsFit: 5,
    trustIntegrity: 5,
    takeCallAgain: true,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("escapeHtml", () => {
  it("escapes the standard html-significant characters", () => {
    expect(escapeHtml("<a>&\"'b")).toBe("&lt;a&gt;&amp;&quot;&#39;b");
  });

  it("returns plain strings unchanged", () => {
    expect(escapeHtml("Hello world")).toBe("Hello world");
  });
});

describe("repHighlight", () => {
  it("returns a valid EmailMessage with name in subject", () => {
    const msg = repHighlight(
      { name: "Jane Doe", email: "jane@example.com" },
      [rating()],
      [rating(), rating()],
    );
    expect(msg.to).toBe("jane@example.com");
    expect(msg.subject).toContain("Jane Doe");
    expect(msg.subject).toMatch(/week on RateMyRep/i);
    expect(msg.html.length).toBeGreaterThan(50);
    expect(msg.text.length).toBeGreaterThan(20);
    expect(msg.html).toContain("<html");
    expect(msg.text).toContain("RateMyRep");
  });

  it("flags risk dimensions when last-7d averages drop below 3", () => {
    const lowRating = rating({
      responsiveness: 1,
      productKnowledge: 2,
    });
    const msg = repHighlight(
      { name: "Joe", email: "joe@example.com" },
      [lowRating],
      [lowRating],
    );
    expect(msg.text.toLowerCase()).toContain("risk flags");
    // Risk-flag highlight uses the formal label
    expect(msg.text).toMatch(/Responsiveness/);
  });

  it("escapes a malicious name in HTML output", () => {
    const msg = repHighlight(
      { name: "<script>alert(1)</script>", email: "x@x.com" },
      [],
      [],
    );
    expect(msg.html).not.toContain("<script>alert(1)</script>");
    expect(msg.html).toContain("&lt;script&gt;");
  });

  it("renders even when there are no ratings at all", () => {
    const msg = repHighlight(
      { name: "Newbie", email: "n@x.com" },
      [],
      [],
    );
    expect(msg.subject).toContain("Newbie");
    expect(msg.html).toContain("New ratings this week");
    expect(msg.text).toContain("New ratings this week: 0");
  });
});

describe("raterHighlight", () => {
  it("returns valid EmailMessage with subject", () => {
    const msg = raterHighlight(
      { name: "Ralph Rater", email: "ralph@x.com" },
      [{ createdAt: new Date() }, { createdAt: new Date() }],
      [
        { createdAt: new Date() },
        { createdAt: new Date() },
        { createdAt: new Date() },
        { createdAt: new Date() },
      ],
    );
    expect(msg.to).toBe("ralph@x.com");
    expect(msg.subject).toContain("Ralph Rater");
    expect(msg.html.length).toBeGreaterThan(50);
    expect(msg.text).toContain("Ratings given this week");
    expect(msg.text).toContain("2");
  });

  it("includes a 'haven't rated anyone this week' nudge when count7 is 0", () => {
    const msg = raterHighlight(
      { name: "Idle", email: "idle@x.com" },
      [],
      [{ createdAt: new Date() }],
    );
    expect(msg.text.toLowerCase()).toMatch(/haven't rated/);
  });
});

describe("managerHighlight", () => {
  it("returns valid EmailMessage and includes manager name in subject", () => {
    const rows: TeamRow[] = [
      {
        name: "Rep One",
        ratingsThisWeek: 3,
        overallNow: 4.5,
        overallPrev: 4.0,
        status: "Trusted",
        statusDropped: false,
      },
      {
        name: "Rep Two",
        ratingsThisWeek: 0,
        overallNow: null,
        overallPrev: 4.2,
        status: "Verified",
        statusDropped: true,
      },
    ];
    const msg = managerHighlight(
      {
        name: "Mary Manager",
        email: "mary@x.com",
        managesType: "REP_MANAGER",
      },
      rows,
    );
    expect(msg.to).toBe("mary@x.com");
    expect(msg.subject).toContain("Mary Manager");
    expect(msg.subject).toMatch(/team/i);
    expect(msg.text).toContain("Rep One");
    expect(msg.text).toContain("Rep Two");
    expect(msg.text.toLowerCase()).toContain("status drops");
  });

  it("renders gracefully with an empty team", () => {
    const msg = managerHighlight(
      {
        name: "Solo",
        email: "solo@x.com",
        managesType: "RATER_MANAGER",
      },
      [],
    );
    expect(msg.html.length).toBeGreaterThan(50);
    expect(msg.text).toMatch(/Team members tracked:\s+0/);
  });

  it("escapes hostile member names", () => {
    const rows: TeamRow[] = [
      {
        name: "<img src=x onerror=alert(1)>",
        ratingsThisWeek: 1,
        overallNow: 4,
        overallPrev: 4,
        status: "Verified",
        statusDropped: false,
      },
    ];
    const msg = managerHighlight(
      { name: "Mgr", email: "m@x.com", managesType: "REP_MANAGER" },
      rows,
    );
    expect(msg.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(msg.html).toContain("&lt;img");
  });
});
