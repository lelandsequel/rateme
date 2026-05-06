// Rater redaction — privacy is a first-class concern.
//
// Spec: "Rater – Only title & Company should be visible – no contact information"
//
// Reads: name, email, contact info on a Rater are hidden from EVERYONE
// except (a) the rater themselves, (b) admins, and (c) the rater-manager
// of that rater (if managed).
//
// We funnel every external rater payload through `publicRater()` so that
// no route accidentally leaks a name. The shape is the only thing
// callers should marshal to the wire.

import type { Role } from "@prisma/client";

export interface PublicRater {
  /** Stable id used as the relational key. NOT the rater's name. */
  userId: string;
  title: string;
  company: string;
  industry: { slug: string; name: string };
  state: string;
}

export interface FullRater extends PublicRater {
  name: string;
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

/** Strip a Rater payload to title + company + industry + state only. */
export function publicRater(src: RaterSource): PublicRater {
  return {
    userId: src.userId,
    title: src.title,
    company: src.company,
    industry: { slug: src.industry.slug, name: src.industry.name },
    state: src.user.state,
  };
}

/** Self / admin / manager view — includes name + email. */
export function fullRater(src: RaterSource): FullRater {
  return {
    ...publicRater(src),
    name: src.user.name,
    email: src.user.email,
    createdAt: src.user.createdAt,
  };
}

/**
 * Decide whether the viewer is allowed to see the rater's full identity.
 * Used to choose between publicRater and fullRater.
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
