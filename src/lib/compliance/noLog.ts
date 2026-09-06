/**
 * No-log compliance helper — stubs for lean gateway
 *
 * Detailed call logs are not persisted in lean gateway.
 */
export function setNoLog(_apiKeyId: string, _noLog: boolean): void {}
export function isNoLog(_apiKeyId: string): boolean {
  return false;
}
