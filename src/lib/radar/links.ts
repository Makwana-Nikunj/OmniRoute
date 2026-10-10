/**
 * links.ts — pure config for the private Radar admin-panel outbound link
 * (F4/T7): the operations-panel URL on the private radar.omniroute.online
 * server.
 *
 * DELIBERATELY DB-FREE and side-effect-free — same shape as the
 * `RADAR_FEED_URL` override already used by `./sync.ts`, so forks/self-hosters
 * point the link at their own deployment via env vars (see
 * docs/frameworks/RADAR.md).
 *
 * This link is read server-side only (inside a route handler); the dashboard
 * never reads `process.env` itself, matching the pattern the D28 referral
 * links already established for the private feed.
 *
 * No price or monetary value is ever resolved, stored, or exposed here — the
 * URL points at a page that is itself the ONLY place pricing lives
 * (spec D14: no pricing in the OSS repo).
 */

import { parseRadarAdminUrl } from "@/shared/validation/radarAdminUrl";

/**
 * Private operations-panel URL configured by the instance owner.
 * Unlike the public supporter flows, this deliberately has no default.
 */
export function getRadarAdminUrl(): string | null {
  return parseRadarAdminUrl(process.env.RADAR_ADMIN_URL);
}
