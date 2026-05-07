/**
 * Weekly highlight email templates.
 *
 * Three audiences:
 *   - REP:     repHighlight     — performance summary on the rep's own ratings
 *   - RATER:   raterHighlight   — fulfillment summary + gentle nudge
 *   - MANAGER: managerHighlight — team-wide rating count + WoW score change
 *
 * Templates return a fully-formed EmailMessage (subject + html + text) —
 * the cron job hands them straight to sendEmail.
 *
 * Style notes:
 *   - Inline HTML, single column, no images. Plays nice with most clients
 *     and skips image-blocking penalties.
 *   - Plain-text companion for accessibility + spam scoring.
 *   - User-controlled strings (rep.name, rater.title) MUST be escaped via
 *     escapeHtml. The plain-text version doesn't need escaping.
 *
 * Aggregates: we lean on aggregateRatings from src/lib/aggregates.ts to
 * compute dimension averages over a window, and the dim < 3 rule for the
 * "risk flags" call-out. We don't reimplement scoring here.
 */

import {
  type RatingForAgg,
  type RatingDimensions,
  type StatusTier,
  aggregateRatings,
} from "@/lib/aggregates";
import type { EmailMessage } from "@/lib/email";

// ---------------------------------------------------------------------------
// Public input shapes — kept narrow on purpose so the cron job can build them
// from prisma rows without leaking the whole user object into templates.
// ---------------------------------------------------------------------------

export interface RepRecipient {
  name: string;
  email: string;
  title?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
}

export interface RaterRecipient {
  name: string;
  email: string;
  title?: string | null;
  company?: string | null;
}

export interface ManagerRecipient {
  name: string;
  email: string;
  managesType: "REP_MANAGER" | "RATER_MANAGER";
  company?: string | null;
}

export interface TeamRow {
  name: string;
  ratingsThisWeek: number;
  overallNow: number | null;
  overallPrev: number | null;
  status: StatusTier;
  statusDropped: boolean;
}

// ---------------------------------------------------------------------------
// HTML escape
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

const COLOR_BG = "#f7f8fa";
const COLOR_CARD = "#ffffff";
const COLOR_TEXT = "#1f2933";
const COLOR_MUTED = "#52606d";
const COLOR_ACCENT = "#1c7ed6";
const COLOR_RISK = "#c92a2a";

function shell(innerHtml: string, preheader: string): string {
  // Preheader is the snippet inboxes preview after the subject. Keeping it
  // short + relevant cuts spam-folder odds.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>RateMyRep weekly highlight</title>
  </head>
  <body style="margin:0;padding:0;background:${COLOR_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${COLOR_TEXT};">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR_BG};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLOR_CARD};border-radius:12px;border:1px solid #e4e7eb;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <div style="font-size:13px;letter-spacing:.04em;color:${COLOR_MUTED};text-transform:uppercase;">RateMyRep</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px 28px;">
                ${innerHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px 28px;border-top:1px solid #e4e7eb;font-size:12px;color:${COLOR_MUTED};">
                You're receiving this weekly summary because your account is active on RateMyRep.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:${COLOR_TEXT};">${escapeHtml(text)}</h1>`;
}

function p(text: string, opts: { muted?: boolean } = {}): string {
  const color = opts.muted ? COLOR_MUTED : COLOR_TEXT;
  return `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;color:${color};">${escapeHtml(text)}</p>`;
}

function statRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:14px;color:${COLOR_MUTED};">${escapeHtml(label)}</td>
    <td align="right" style="padding:8px 0;font-size:14px;color:${COLOR_TEXT};font-weight:600;">${escapeHtml(value)}</td>
  </tr>`;
}

function risk(text: string): string {
  return `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.5;color:${COLOR_RISK};">⚠ ${escapeHtml(text)}</p>`;
}

// ---------------------------------------------------------------------------
// Dimension helpers
// ---------------------------------------------------------------------------

const DIM_LABELS: Array<[keyof RatingDimensions, string]> = [
  ["responsiveness", "Responsiveness"],
  ["productKnowledge", "Product knowledge"],
  ["followThrough", "Follow-through"],
  ["listeningNeedsFit", "Listening / needs-fit"],
  ["trustIntegrity", "Trust & integrity"],
];

function topStrengths(
  averages: RatingDimensions | null,
  n = 3,
): Array<[string, number]> {
  if (!averages) return [];
  return DIM_LABELS
    .map(([k, label]) => [label, averages[k]] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function diff(now: number | null, prev: number | null): string {
  if (now == null || prev == null) return "n/a";
  const delta = Math.round((now - prev) * 10) / 10;
  if (delta === 0) return "= 0.0";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// repHighlight
// ---------------------------------------------------------------------------

export function repHighlight(
  rep: RepRecipient,
  ratings7d: ReadonlyArray<RatingForAgg>,
  ratings30d: ReadonlyArray<RatingForAgg>,
): EmailMessage {
  const subject = `Your week on RateMyRep — ${rep.name}`;
  const agg7 = aggregateRatings(ratings7d, rep.avatarUrl ?? null);
  const agg30 = aggregateRatings(ratings30d, rep.avatarUrl ?? null);

  const newCount = agg7.ratingCount;
  const overall7 = agg7.overall;
  const overall30 = agg30.overall;
  const strengths = topStrengths(agg30.averages, 3);

  // Risk flag: any dimension below 3 in last 7d
  const flags: string[] = [];
  if (agg7.averages) {
    for (const [k, label] of DIM_LABELS) {
      if (agg7.averages[k] < 3) {
        flags.push(`${label} averaged ${agg7.averages[k].toFixed(1)} this week`);
      }
    }
  }
  if (agg7.takeCallAgainPct != null && agg7.takeCallAgainPct < 50) {
    flags.push(`Only ${agg7.takeCallAgainPct}% would take your call again this week`);
  }

  // -------- HTML --------
  const flagsHtml =
    flags.length > 0
      ? `<div style="margin:8px 0 16px 0;padding:12px 14px;background:#fff5f5;border:1px solid #ffe3e3;border-radius:8px;">
          <div style="font-weight:600;color:${COLOR_RISK};margin-bottom:6px;">Risk flags</div>
          ${flags.map((f) => risk(f)).join("")}
        </div>`
      : "";

  const strengthsHtml =
    strengths.length > 0
      ? `<div style="margin:16px 0;">
          <div style="font-weight:600;margin-bottom:8px;">Top strengths (last 30 days)</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${strengths.map(([label, score]) => statRow(label, score.toFixed(1))).join("")}
          </table>
        </div>`
      : "";

  const summaryHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${statRow("New ratings this week", String(newCount))}
    ${statRow("Overall (7d)", overall7 != null ? overall7.toFixed(1) : "—")}
    ${statRow("Overall (prior 30d)", overall30 != null ? overall30.toFixed(1) : "—")}
    ${statRow("Change", diff(overall7, overall30))}
    ${statRow("Status", agg30.status)}
  </table>`;

  const greetingName = (rep.name || "there").split(" ")[0] || "there";
  const inner = `${h1(`Hi ${greetingName}, here's your week.`)}
    ${p("A quick performance summary plus anything that needs your attention.", { muted: true })}
    ${summaryHtml}
    ${strengthsHtml}
    ${flagsHtml}
    ${p("Suggested next step: focus on the lowest-scoring dimension above and aim to add at least one new rated interaction this week.", { muted: true })}`;

  const html = shell(inner, `${newCount} new rating(s) this week.`);

  // -------- Text --------
  const lines: string[] = [];
  lines.push(`Hi ${greetingName}, here's your week on RateMyRep.`);
  lines.push("");
  lines.push(`New ratings this week: ${newCount}`);
  lines.push(`Overall (7d):           ${overall7 != null ? overall7.toFixed(1) : "—"}`);
  lines.push(`Overall (prior 30d):    ${overall30 != null ? overall30.toFixed(1) : "—"}`);
  lines.push(`Change:                 ${diff(overall7, overall30)}`);
  lines.push(`Status:                 ${agg30.status}`);
  if (strengths.length > 0) {
    lines.push("");
    lines.push("Top strengths (last 30 days):");
    for (const [label, score] of strengths) {
      lines.push(`  - ${label}: ${score.toFixed(1)}`);
    }
  }
  if (flags.length > 0) {
    lines.push("");
    lines.push("Risk flags:");
    for (const f of flags) lines.push(`  ! ${f}`);
  }
  lines.push("");
  lines.push("Suggested next step: focus on the lowest-scoring dimension above");
  lines.push("and aim to add at least one new rated interaction this week.");
  lines.push("");
  lines.push("— RateMyRep");

  return { to: rep.email, subject, html, text: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// raterHighlight
// ---------------------------------------------------------------------------

export function raterHighlight(
  rater: RaterRecipient,
  given7d: ReadonlyArray<{ createdAt: Date }>,
  given30d: ReadonlyArray<{ createdAt: Date }>,
): EmailMessage {
  const subject = `Your week on RateMyRep — ${rater.name}`;
  const count7 = given7d.length;
  const count30 = given30d.length;
  // "fulfillment vs prior" — count this week vs the 23-day window before it
  // (i.e. 30d total minus the most recent 7d). Avoids a separate query.
  const priorCount = Math.max(0, count30 - count7);

  const greetingName = (rater.name || "there").split(" ")[0] || "there";

  // -------- HTML --------
  const summaryHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${statRow("Ratings given this week", String(count7))}
    ${statRow("Ratings given prior 23 days", String(priorCount))}
    ${statRow("Last 30 days total", String(count30))}
  </table>`;

  let nudge: string;
  if (count7 === 0) {
    nudge =
      "It looks like you haven't rated anyone this week. Even one quick rating helps reps you trust stand out.";
  } else if (count7 < priorCount / 3) {
    nudge =
      "You're trending lighter than usual. If you've worked with a rep recently, take 30 seconds to rate them.";
  } else {
    nudge =
      "Thanks for keeping the community honest. Your consistent ratings help good reps get found.";
  }

  const inner = `${h1(`Hi ${greetingName}, your week of ratings.`)}
    ${p("A quick recap of the ratings you've given lately.", { muted: true })}
    ${summaryHtml}
    <div style="margin-top:16px;padding:12px 14px;background:#f1f8ff;border:1px solid #d0ebff;border-radius:8px;font-size:14px;line-height:1.5;color:${COLOR_TEXT};">
      ${escapeHtml(nudge)}
    </div>`;

  const html = shell(inner, `${count7} rating(s) given this week.`);

  // -------- Text --------
  const lines: string[] = [
    `Hi ${greetingName}, here's your week of ratings on RateMyRep.`,
    "",
    `Ratings given this week:        ${count7}`,
    `Ratings given prior 23 days:    ${priorCount}`,
    `Last 30 days total:             ${count30}`,
    "",
    nudge,
    "",
    "— RateMyRep",
  ];

  return { to: rater.email, subject, html, text: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// managerHighlight
// ---------------------------------------------------------------------------

export function managerHighlight(
  manager: ManagerRecipient,
  teamRows: ReadonlyArray<TeamRow>,
): EmailMessage {
  const subject = `Your team's week on RateMyRep — ${manager.name}`;

  const totalRatings = teamRows.reduce(
    (acc, r) => acc + (r.ratingsThisWeek ?? 0),
    0,
  );

  // Average WoW change across team members who have both data points
  let deltaSum = 0;
  let deltaCount = 0;
  for (const r of teamRows) {
    if (r.overallNow != null && r.overallPrev != null) {
      deltaSum += r.overallNow - r.overallPrev;
      deltaCount++;
    }
  }
  const avgDelta = deltaCount > 0 ? deltaSum / deltaCount : null;

  const drops = teamRows.filter((r) => r.statusDropped);

  const greetingName = (manager.name || "there").split(" ")[0] || "there";

  // -------- HTML --------
  const summaryHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${statRow("Team members tracked", String(teamRows.length))}
    ${statRow("Ratings this week (team)", String(totalRatings))}
    ${statRow(
      "Avg WoW score change",
      avgDelta == null
        ? "n/a"
        : `${avgDelta >= 0 ? "+" : ""}${(Math.round(avgDelta * 10) / 10).toFixed(1)}`,
    )}
  </table>`;

  const teamHtml = teamRows.length === 0
    ? p("No team activity this week.", { muted: true })
    : `<div style="margin-top:16px;">
        <div style="font-weight:600;margin-bottom:8px;">By team member</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e7eb;">
          ${teamRows
            .map(
              (r) => `<tr>
                <td style="padding:10px 0;border-bottom:1px solid #e4e7eb;font-size:14px;">${escapeHtml(r.name)}<div style="color:${COLOR_MUTED};font-size:12px;">${escapeHtml(r.status)}${r.statusDropped ? " — dropped" : ""}</div></td>
                <td align="right" style="padding:10px 0;border-bottom:1px solid #e4e7eb;font-size:14px;color:${COLOR_TEXT};">
                  <div>${escapeHtml(String(r.ratingsThisWeek))} this wk</div>
                  <div style="color:${COLOR_MUTED};font-size:12px;">${escapeHtml(diff(r.overallNow, r.overallPrev))}</div>
                </td>
              </tr>`,
            )
            .join("")}
        </table>
      </div>`;

  const dropHtml = drops.length === 0
    ? ""
    : `<div style="margin-top:16px;padding:12px 14px;background:#fff5f5;border:1px solid #ffe3e3;border-radius:8px;">
        <div style="font-weight:600;color:${COLOR_RISK};margin-bottom:6px;">Status drops</div>
        ${drops.map((d) => risk(`${d.name} — now ${d.status}`)).join("")}
      </div>`;

  const inner = `${h1(`Hi ${greetingName}, your team's week.`)}
    ${p(
      manager.managesType === "REP_MANAGER"
        ? "Snapshot of how your reps performed."
        : "Snapshot of your raters' contribution.",
      { muted: true },
    )}
    ${summaryHtml}
    ${teamHtml}
    ${dropHtml}`;

  const html = shell(
    inner,
    `${totalRatings} team rating(s) this week.`,
  );

  // -------- Text --------
  const lines: string[] = [
    `Hi ${greetingName}, here's your team's week on RateMyRep.`,
    "",
    `Team members tracked:     ${teamRows.length}`,
    `Ratings this week (team): ${totalRatings}`,
    `Avg WoW score change:     ${
      avgDelta == null
        ? "n/a"
        : `${avgDelta >= 0 ? "+" : ""}${(Math.round(avgDelta * 10) / 10).toFixed(1)}`
    }`,
  ];
  if (teamRows.length > 0) {
    lines.push("");
    lines.push("By team member:");
    for (const r of teamRows) {
      lines.push(
        `  - ${r.name} [${r.status}${r.statusDropped ? " — dropped" : ""}] ` +
          `${r.ratingsThisWeek} this wk (${diff(r.overallNow, r.overallPrev)})`,
      );
    }
  }
  if (drops.length > 0) {
    lines.push("");
    lines.push("Status drops:");
    for (const d of drops) lines.push(`  ! ${d.name} — now ${d.status}`);
  }
  lines.push("");
  lines.push("— RateMyRep");

  return { to: manager.email, subject, html, text: lines.join("\n") };
}
