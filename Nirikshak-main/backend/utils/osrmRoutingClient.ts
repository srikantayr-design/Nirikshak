import type { OsrmRoute, RouteGeometry, RoutePoint } from "../types/routing.ts";

type OsrmResponse = {
  code: string;
  routes?: Array<{ distance: number; duration: number; geometry: RouteGeometry }>;
};

export async function fetchOsrmRoutes(origin: RoutePoint, destination: RoutePoint, signal?: AbortSignal): Promise<OsrmRoute[]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?alternatives=true&steps=true&geometries=geojson&overview=full`;
  const response = await fetch(url, { signal });
  const body = await response.text();
  let data: OsrmResponse & { message?: string } = {
    code: "",
  };
  try {
    data = JSON.parse(body) as OsrmResponse & { message?: string };
  } catch {
    data = { code: "InvalidResponse", message: body.slice(0, 240) };
  }
  if (!response.ok) throw new Error(`OSRM request failed (${response.status}) for ${url}: ${data.message ?? data.code}`);
  if (data.code !== "Ok" || !data.routes?.length) throw new Error(`No drivable route for ${url}: ${data.message ?? data.code}`);
  return data.routes.map((route) => ({ distanceMeters: route.distance, durationSeconds: route.duration, geometry: route.geometry }));
}