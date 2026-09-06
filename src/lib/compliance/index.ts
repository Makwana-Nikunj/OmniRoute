/**
 * Compliance Controls — stubs for lean gateway
 *
 * Audit logging is a no-op in the lean gateway configuration.
 */

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
