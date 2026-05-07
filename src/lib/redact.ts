// Rater redaction.
//
// Updated spec (2026-04-29): the client wants reviewer names VISIBLE on
// the public rater payload. Email and other contact info remain hidden
// from REPs / unrelated viewers — only self / admin / managing-manager
// see those.
//
// `publicRater` now returns name + title + company + industry + state.
// `fullRater` additionally returns email + createdAt for the privileged
// view paths.

import type { Role } from "@prisma/client";

export interface PublicRater {
  /** Stable id used as the relational key. */
  userId: string;
  /** Reviewer display name — visible to all viewers. */
  name: string;
  title: string;
  company: string;
  industry: { slug: string; name: string };
  state: string;
}

export interface FullRater extends PublicRater {
  email: string;
  createdAt: Date;
}

interface RaterSource {
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    state: string;
    createdAt: Date;
  };
  title: string;
  company: string;
  industry: { slug: string; name: string };
}

/**
 * Public rater payload — name + title + company + industry + state. Email
 * is intentionally OMITTED for any viewer other than self/admin/manager
 * (use fullRater for those).
 */
export function publicRater(src: RaterSource): PublicRater {
  return {
    userId: src.userId,
    name: src.user.name,
    title: src.title,
    company: src.company,
    industry: { slug: src.industry.slug, name: src.industry.name },
    state: src.user.state,
  };
}

/** Self / admin / manager view — adds email + createdAt. */
export function fullRater(src: RaterSource): FullRater {
  return {
    ...publicRater(src),
    email: src.user.email,
    createdAt: src.user.createdAt,
  };
}

/**
 * Decide whether the viewer is allowed to see the rater's contact info
 * (i.e. email). Used to choose between publicRater and fullRater.
 */
export function canSeeFullRater(opts: {
  viewerId: string;
  viewerRole: Role | string;
  raterUserId: string;
  managerOfRaterUserIds?: ReadonlyArray<string>;
}): boolean {
  if (opts.viewerId === opts.raterUserId) return true;
  if (opts.viewerRole === "ADMIN") return true;
  if (
    opts.viewerRole === "RATER_MANAGER" &&
    opts.managerOfRaterUserIds?.includes(opts.raterUserId)
  ) {
    return true;
  }
  return false;
}
