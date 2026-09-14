import { infrastructureAssets } from "./incidents";
import type { Asset, Incident, ResponseUnit, RouteGeometry, RouteOption } from "./incidents";

export type Department = { id: string; name: string; incidentTypes: string[] };
export type Obstacle = { id: string; name: string; type: string; risk: "LOW" | "MEDIUM" | "HIGH"; lat: number; lng: number; effectMinutes: number; mitigation: string; assetId?: string };
export type RouteCandidate = RouteOption & { score: number; scoreBreakdown: { eta: number; blockage: number; hazard: number; congestion: number; infrastructure: number }; obstacles: Obstacle[] };
export type RoutingDataset = { departments: Department[]; responseUnits: ResponseUnit[]; roads: Asset[]; obstacles: Obstacle[]; incidentTargets: Record<string, string> };

type OsrmRoute = { distance: number; duration: number; geometry: RouteGeometry };

export const departments: Department[] = [
  { id: "fire", name: "Fire Department", incidentTypes: ["STRUCTURAL FIRE", "FIRE", "INDUSTRIAL ACCIDENT"] },
  { id: "infrastructure", name: "Infrastructure / Disaster Response", incidentTypes: ["FLOOD", "STRUCTURAL DAMAGE", "STRUCTURAL COLLAPSE", "WATER NETWORK"] },
  { id: "electricity", name: "Electricity Department", incidentTypes: ["POWER GRID", "POWER FAILURE", "ELECTRICAL FAILURE"] },
  { id: "traffic", name: "Traffic Department", incidentTypes: ["TRANSPORT", "ROAD BLOCKAGE"] },
  { id: "water", name: "Water & Sewerage", incidentTypes: ["WATER NETWORK"] },
];

export const responseUnits: ResponseUnit[] = [
  { id: "F03", name: "Fire Unit F03", department: "Fire Department", baseAssetId: "F03", status: "AVAILABLE" },
  { id: "F04", name: "Fire Unit F04", department: "Fire Department", baseAssetId: "F03", status: "BUSY" },
  { id: "E12", name: "Grid Crew E12", department: "Electricity Department", baseAssetId: "EB1", status: "AVAILABLE" },
  { id: "E18", name: "Grid Crew E18", department: "Electricity Department", baseAssetId: "ER1", status: "DEPLOYED" },
  { id: "T05", name: "Traffic Unit T05", department: "Traffic Department", baseAssetId: "P02", status: "AVAILABLE" },
  { id: "T08", name: "Recovery Unit T08", department: "Traffic Department", baseAssetId: "ER1", status: "BUSY" },
  { id: "W07", name: "Water Crew W07", department: "Water & Sewerage", baseAssetId: "ER1", status: "AVAILABLE" },
  { id: "W11", name: "Pump Technician W11", department: "Water & Sewerage", baseAssetId: "W2", status: "BUSY" },
  { id: "R21", name: "Rescue Team R21", department: "Infrastructure / Disaster Response", baseAssetId: "ER1", status: "AVAILABLE" },
];

export const incidentTargets: Record<string, string> = { "INC-2407": "B-A", "INC-2406": "T4", "INC-2405": "R12", "INC-2404": "M7", "INC-2403": "B-A", "INC-2401": "FP01" };

export const obstacles: Obstacle[] = [
  { id: "obstacle-r12", name: "Road R12", type: "Road blockage", risk: "HIGH", lat: 12.9728, lng: 77.6384, effectMinutes: 3, mitigation: "Traffic diversion / road clearance", assetId: "R12" },
  { id: "obstacle-t4", name: "Transformer T4", type: "Critical infrastructure exposure", risk: "HIGH", lat: 12.9744, lng: 77.6444, effectMinutes: 2, mitigation: "Keep 50m exclusion buffer and isolate if needed", assetId: "T4" },
  { id: "obstacle-h1", name: "Hospital H1 access", type: "Critical access zone", risk: "MEDIUM", lat: 12.9761, lng: 77.6358, effectMinutes: 1, mitigation: "Protect ambulance approach", assetId: "H1" },
  { id: "obstacle-w2", name: "Water Pump W2", type: "Hazard zone", risk: "MEDIUM", lat: 12.9683, lng: 77.6448, effectMinutes: 2, mitigation: "Coordinate utility access with water control", assetId: "W2" },
];

export const routingDataset: RoutingDataset = { departments, responseUnits, roads: infrastructureAssets.filter((asset) => asset.type === "ROAD"), obstacles, incidentTargets };

export function departmentForIncident(incident: Incident): Department {
  return departments.find((department) => department.incidentTypes.some((type) => incident.type.includes(type))) ?? departments[0];
}

export function unitsForDepartment(department: Department): ResponseUnit[] {
  return responseUnits.filter((unit) => unit.department === department.name);
}

export function targetAssetIdForIncident(incident: Incident): string {
  return incidentTargets[incident.id] ?? incident.affectedInfrastructure[0] ?? "B-A";
}

function distanceToSegment(point: [number, number], start: [number, number], end: [number, number]): number {
  const latScale = 111_000;
  const lngScale = 111_000 * Math.cos((point[1] * Math.PI) / 180);
  const px = (point[1] - start[1]) * lngScale;
  const py = (point[0] - start[0]) * latScale;
  const sx = (end[1] - start[1]) * lngScale;
  const sy = (end[0] - start[0]) * latScale;
  const length = sx * sx + sy * sy;
  const ratio = length === 0 ? 0 : Math.max(0, Math.min(1, (px * sx + py * sy) / length));
  return Math.hypot(px - ratio * sx, py - ratio * sy);
}

export function obstaclesAlongRoute(
  geometry: RouteGeometry,
  routeObstacles: Obstacle[] = []
): Obstacle[] {
  return routeObstacles.filter((obstacle) =>
    geometry.coordinates.some(
      (coordinate, index, coordinates) =>
        index > 0 &&
        distanceToSegment(
          [obstacle.lat, obstacle.lng],
          [coordinates[index - 1][1], coordinates[index - 1][0]],
          [coordinate[1], coordinate[0]]
        ) < 180
    )
  );
}

export function scoreRoute(route: OsrmRoute, routeObstacles: Obstacle[]): Omit<RouteCandidate, "id" | "name" | "routeRank" | "recommended"> {
  const encountered = obstaclesAlongRoute(route.geometry, routeObstacles);
  const eta = Math.ceil(route.duration / 60);
  const blockage = encountered.reduce((total, obstacle) => total + (obstacle.risk === "HIGH" ? 30 : obstacle.risk === "MEDIUM" ? 15 : 5), 0);
  const hazard = encountered.filter((obstacle) => obstacle.type.includes("Hazard") || obstacle.type.includes("exposure")).length * 18;
  const congestion = encountered.filter((obstacle) => obstacle.type.includes("blockage")).length * 12;
  const infrastructure = encountered.filter((obstacle) => obstacle.type.includes("Critical")).length * 10;
  const score = eta + blockage + hazard + congestion + infrastructure;
  const risk = score > 70 ? "HIGH" : score > 40 ? "MEDIUM" : "LOW";
  const traffic = congestion > 20 ? "Heavy" : congestion ? "Moderate" : "Light";
  const hazardLabel = hazard > 18 ? "High hazard exposure" : hazard ? "Moderate hazard exposure" : "Low hazard exposure";
  return { distance: `${(route.distance / 1000).toFixed(1)} km`, eta: `${eta} min`, risk, blockage: `${Math.min(99, blockage)}%`, traffic, hazard: hazardLabel, explanation: encountered.length ? `Score ${score}: ${eta} ETA + ${blockage} blockage + ${hazard} hazard + ${congestion} congestion + ${infrastructure} infrastructure exposure.` : `Score ${score}: ${eta} ETA with no known mock obstacles on this road geometry.`, offset: 0, geometry: route.geometry, score, scoreBreakdown: { eta, blockage, hazard, congestion, infrastructure }, obstacles: encountered };
}

export async function fetchDrivingRoutes(origin: Asset, target: Asset, signal?: AbortSignal): Promise<OsrmRoute[]> {
  if (origin.lat == null || origin.lng == null || target.lat == null || target.lng == null) throw new Error("Route calculation unavailable: selected base or incident has no coordinates.");
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${target.lng},${target.lat}?alternatives=true&steps=true&geometries=geojson&overview=full`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`OSRM request failed (${response.status})`);
  const data = await response.json() as { code: string; routes?: OsrmRoute[] };
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("No drivable route found between response unit and incident.");
  return data.routes;
}
