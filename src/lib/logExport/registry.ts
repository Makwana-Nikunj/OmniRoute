/**
 * Log-export destination registry.
 *
 * The single place that knows which destinations exist. Adding a destination
 * means writing `destinations/<name>.ts` and adding it to this array — the
 * runner, the REST layer and the dashboard form all read from the descriptors
 * below.
 *
 * Lean-gateway note: the BigQuery destination was removed together with the
 * `@google-cloud/bigquery` dependency (it was the only built-in destination),
 * so the built-in list is empty and the export runner is a structural no-op
 * until a destination is registered. The test-only registration hook is kept
 * so the pipeline itself stays covered.
 */

import type { LogExportConfigField, LogExportDestinationType } from "./types";

const DESTINATIONS: ReadonlyArray<LogExportDestinationType> = [];

/**
 * Types registered at runtime. Only tests use this: it lets the runner, the REST layer
 * and the secret handling be exercised through a fake destination, proving the pipeline
 * carries no BigQuery-specific knowledge.
 */
const testDestinations = new Map<string, LogExportDestinationType>();

export function listLogExportDestinationTypes(): ReadonlyArray<LogExportDestinationType> {
  return testDestinations.size === 0
    ? DESTINATIONS
    : [...DESTINATIONS, ...testDestinations.values()];
}

export function getLogExportDestinationType(id: string): LogExportDestinationType | undefined {
  return DESTINATIONS.find((destination) => destination.id === id) ?? testDestinations.get(id);
}

/** Test-only: register a destination type for the duration of a test. */
export function __registerLogExportDestinationTypeForTest(
  destination: LogExportDestinationType
): void {
  testDestinations.set(destination.id, destination);
}

/** Test-only: drop every runtime-registered destination type. */
export function __resetLogExportDestinationTypesForTest(): void {
  testDestinations.clear();
}

export function isKnownLogExportDestinationType(id: string): boolean {
  return getLogExportDestinationType(id) !== undefined;
}

export interface LogExportDestinationTypeDescriptor {
  id: string;
  label: string;
  description: string;
  docsUrl: string | null;
  fields: readonly LogExportConfigField[];
}

/**
 * Serializable descriptors for the UI. The dashboard renders any destination's form
 * from these, so a new destination needs no UI change.
 */
export function describeLogExportDestinationTypes(): LogExportDestinationTypeDescriptor[] {
  return listLogExportDestinationTypes().map((destination) => ({
    id: destination.id,
    label: destination.labelFallback,
    description: destination.descriptionFallback,
    docsUrl: destination.docsUrl ?? null,
    fields: destination.fields,
  }));
}
