/**
 * Services registry — stubs for lean gateway
 */

/** Null supervisor — embedded services are not available in lean gateway */
export function getSupervisor(_tool: string): null {
  return null;
}

export function registerSupervisor(_supervisor: unknown): void {}
export function unregisterSupervisor(_tool: string): void {}
