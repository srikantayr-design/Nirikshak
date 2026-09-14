import { useEffect, useState } from "react";
import type { Asset, Incident, RouteOption } from "../data/incidents";
import type { RouteAnalysisResult } from "../../../backend/types/routing.ts";
import { loadBackendIncidentAnalysis } from "../services/backendAnalysisService";
import DigitalTwinMap from "./DigitalTwinMap";

type Props = {
  departmentCode: string;
  departmentName: string;
  incidents: Incident[];
  assets: Asset[];
  onBack: () => void;
};

type DepartmentRoute = {
  incident: Incident;
  analysis: RouteAnalysisResult;
  option: RouteOption;
  origin: Asset;
  target: Asset;
};

function routeOption(route: RouteAnalysisResult): RouteOption | null {
  const candidate = route.candidates.find((item) => item.recommended) ?? route.candidates[0];
  if (!candidate) return null;
  return {
    id: candidate.routeId,
    name: `${route.departmentName ?? route.departmentCode ?? "Response"} route`,
    distance: `${(candidate.distanceMeters / 1000).toFixed(1)} km`,
    eta: `${Math.ceil(candidate.durationSeconds / 60)} min`,
    risk: candidate.status === "BLOCKED" ? "HIGH" : candidate.status === "CAUTION" ? "MEDIUM" : "LOW",
    blockage: `${candidate.exposures.filter((exposure) => exposure.blocked).length * 25}%`,
    traffic: candidate.exposures.length ? "Affected" : "Clear",
    hazard: candidate.exposures.length ? "Infrastructure exposure" : "No known exposure",
    explanation: candidate.explanation,
    offset: 0,
    geometry: candidate.geometry,
    routeRank: candidate.routeRank,
    recommended: true,
  };
}

export default function DepartmentRouteDashboard({ departmentCode, departmentName, incidents, assets, onBack }: Props) {
  const [routes, setRoutes] = useState<DepartmentRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void Promise.all(incidents.map(async (incident) => ({ incident, analysis: await loadBackendIncidentAnalysis(incident.id, incident.severity, controller.signal) })))
      .then((results) => {
        if (controller.signal.aborted) return;
        const departmentRoutes = results.flatMap(({ incident, analysis }) => analysis.routes
          .filter((route) => route.departmentCode === departmentCode)
          .flatMap((route) => {
            const option = routeOption(route);
            const origin = assets.find((asset) => asset.id === route.originAssetId) ?? { id: route.resourceId, name: route.resourceId, type: "RESPONSE RESOURCE", status: "AVAILABLE", detail: "Stored response resource location", x: 50, y: 50, lat: route.origin.latitude, lng: route.origin.longitude } satisfies Asset;
            const target = assets.find((asset) => asset.id === route.destinationAssetId) ?? assets.find((asset) => incident.affectedInfrastructure.includes(asset.name));
            return option && target ? [{ incident, analysis: route, option, origin, target }] : [];
          }));
        setRoutes(departmentRoutes);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Department routes unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [departmentCode, incidents, assets]);

  const mapRoutes = routes.map((route) => ({
    origin: route.origin,
    target: route.target,
    option: route.option,
    label: `${route.incident.title} · ${route.analysis.routePurpose ?? "response"}`,
  }));
  const relevantAssetIds = new Set(routes.flatMap((route) => [route.origin.id, route.target.id]));
  const mapAssets = assets.filter((asset) => relevantAssetIds.has(asset.id) || ["HOSPITAL", "FIRE STATION", "POLICE", "EMERGENCY CENTRE"].includes(asset.type));

  return <div className="department-dashboard">
    <button className="text-button" onClick={onBack}>← Departments</button>
    <div className="response-heading"><div><span className="eyebrow">DEPARTMENT ROUTING · {departmentCode}</span><h2>{departmentName}</h2><p>Current displayed incidents only · {routes.length} relevant route{routes.length === 1 ? "" : "s"}</p></div></div>
    {loading && <p className="muted-copy">Loading department-specific routes...</p>}
    {error && <p className="muted-copy">Unable to load department routes: {error}</p>}
    {!loading && !error && !routes.length && <section className="panel"><div className="panel-header"><div><span className="eyebrow">PENDING INCIDENTS</span><h2>0</h2></div></div><p className="muted-copy">No active incidents currently require action from this department.</p></section>}
    {!loading && !error && routes.length > 0 && <>
      <section className="panel response-map-panel"><div className="panel-header"><div><span className="eyebrow">MULTI-INCIDENT ROAD NETWORK</span><h2>Operational routes</h2></div></div><DigitalTwinMap assets={mapAssets} locations={[]} layers={{ roads: true, buildings: true, hospitals: true, fire: true, police: true, electricity: true, water: true, emergency: true, fuel: true }} selectedAsset={null} selectedLocation={null} onAsset={() => undefined} onLocation={() => undefined} routes={mapRoutes} /></section>
      <section className="panel"><div className="panel-header"><div><span className="eyebrow">INCIDENT-SPECIFIC ASSIGNMENTS</span><h2>Routes and actions</h2></div></div><div className="route-options">{routes.map((route) => <div className="route-option selected" key={`${route.incident.id}-${route.analysis.routePurpose}`}><span><b>{route.incident.title}</b><small>{route.analysis.routePurpose} · {route.origin.name} → {route.target.name}</small></span><strong>{route.option.eta}<small>{route.option.risk} risk</small></strong></div>)}</div></section>
    </>}
  </div>;
}
