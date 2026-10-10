/**
 * Compliance Controls — stubs for lean gateway
 *
 * Audit logging is a no-op in the lean gateway configuration.
 */

import { getClientIpFromRequest } from "@/lib/ipUtils";
import { getRequestId } from "@/shared/utils/requestId";
import { randomUUID } from "node:crypto";

export type AuditLogEntry = {
  action: string;
  actor?: string;
  target?: string;
  resourceType?: string;
  status?: string;
  requestId?: string;
  details?: unknown;
};

/** No-op audit logger — compliance logging disabled in lean gateway */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  // intentionally empty
}

export function getAuditRequestContext(request?: {
  headers?: Headers | { get?: (name: string) => string | null };
  socket?: { remoteAddress?: string };
  ip?: string;
}) {
  return {
    ipAddress: request ? getClientIpFromRequest(request) : null,
    requestId: getRequestId() || request?.headers?.get?.("x-request-id") || randomUUID(),
  };
}

export async function initAuditLog(): Promise<void> {}
export async function cleanupExpiredLogs(): Promise<Record<string, number>> {
  return {
    deletedUsage: 0,
    deletedCallLogs: 0,
    deletedProxyLogs: 0,
    deletedRequestDetailLogs: 0,
    deletedAuditLogs: 0,
    deletedMcpAuditLogs: 0,
  };
}
