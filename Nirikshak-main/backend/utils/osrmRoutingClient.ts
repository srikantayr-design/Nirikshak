import type { OsrmRoute, RouteGeometry, RoutePoint } from "../types/routing.ts";

type OsrmResponse = {
  code: string;
  routes?: Array<{ distance: number; duration: number; geometry: RouteGeometry }>;
};

export async function fetchOsrmRoutes(origin: RoutePoint, destination: RoutePoint, signal?: AbortSignal): Promise<OsrmRoute[]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?alternatives=true&steps=true&geometries=geojson&overview=full`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`OSRM request failed (${response.status})`);
  const data = await response.json() as OsrmResponse;
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("No drivable route found between resource and incident.");
  return data.routes.map((route) => ({ distanceMeters: route.distance, durationSeconds: route.duration, geometry: route.geometry }));
}