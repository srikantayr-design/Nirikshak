import type { Incident } from "../data/incidents";

const severityRank: Record<Incident["severity"], number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const statusRank: Record<string, number> = {
  ACTIVE: 3,
  DISPATCHED: 2,
  MONITORING: 1,
};

export function compareIncidentPriority(left: Incident, right: Incident): number {
  return severityRank[right.severity] - severityRank[left.severity]
    || (statusRank[right.status] ?? 0) - (statusRank[left.status] ?? 0)
    || right.cascade.escalationProbability - left.cascade.escalationProbability
    || right.confidence - left.confidence
    || right.affectedInfrastructure.length - left.affectedInfrastructure.length
    || left.id.localeCompare(right.id);
}

export function prioritizeIncidents(incidents: Incident[]): Incident[] {
  return [...incidents].sort(compareIncidentPriority);
}

export function highestPriorityIncident(incidents: Incident[]): Incident | undefined {
  return prioritizeIncidents(incidents)[0];
}