import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { Incident, ResponseUnit, Severity } from "../data/incidents";
import { infrastructureAssets, monitoredLocations } from "../data/incidents";
import { departmentForIncident, fetchDrivingRoutes, obstacles, scoreRoute, targetAssetIdForIncident, unitsForDepartment, type RouteCandidate } from "../data/routing";
import DigitalTwinMap from "./DigitalTwinMap";

type Props = { incident: Incident; onBack: () => void; responseStatus?: string; onDispatch: (unitId: string) => void; SeverityTag: (props: { severity: Severity }) => ReactElement; StatusTag: (props: { status: string }) => ReactElement; Panel: (props: { title: string; eyebrow?: string; children: ReactNode; className?: string }) => ReactElement };

export default function EmergencyRouting({ incident, onBack, responseStatus, onDispatch, SeverityTag, StatusTag, Panel }: Props) {
  const department = departmentForIncident(incident);
  const departmentUnits = unitsForDepartment(department);
  const [unitId, setUnitId] = useState(departmentUnits.find((unit) => unit.status === "AVAILABLE")?.id ?? departmentUnits[0]?.id ?? "");
  const [routes, setRoutes] = useState<RouteCandidate[]>([]);
  const [routeId, setRouteId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dispatchedAt, setDispatchedAt] = useState<string | null>(null);
  const target = infrastructureAssets.find((asset) => asset.id === targetAssetIdForIncident(incident)) ?? infrastructureAssets[0];
  const unit: ResponseUnit = departmentUnits.find((item) => item.id === unitId) ?? departmentUnits[0];
  const origin = infrastructureAssets.find((asset) => asset.id === unit?.baseAssetId) ?? infrastructureAssets[0];
  const selectedRoute = routes.find((route) => route.id === routeId) ?? routes[0];
  const recommendedRoute = routes.reduce<RouteCandidate | undefined>((best, route) => !best || route.score < best.score ? route : best, undefined);
  const dispatchStatus = responseStatus ?? (dispatchedAt ? "En Route" : unit?.status ?? "Unavailable");

  const loadRoutes = async () => {
    setLoading(true);
    setError("");
    setRoutes([]);
    setRouteId("");
    try {
      const osrmRoutes = await fetchDrivingRoutes(origin, target);
      const candidates = osrmRoutes.map((route, index) => ({ ...scoreRoute(route, obstacles), id: `route-${index + 1}`, name: index === 0 ? "Route A" : `Route ${String.fromCharCode(65 + index)}`, routeRank: index + 1, recommended: false }));
      const best = candidates.reduce((current, candidate) => !current || candidate.score < current.score ? candidate : current, undefined as RouteCandidate | undefined);
      setRoutes(candidates.map((candidate) => ({ ...candidate, recommended: candidate.id === best?.id })));
      setRouteId(best?.id ?? "");
    } catch (routeError) {
      if (routeError instanceof DOMException && routeError.name === "AbortError") return;
      setError(routeError instanceof Error ? routeError.message : "Route calculation unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setUnitId(departmentUnits.find((item) => item.status === "AVAILABLE")?.id ?? departmentUnits[0]?.id ?? "");
    setDispatchedAt(null);
  }, [incident.id]);
  useEffect(() => { void loadRoutes(); }, [origin.id, target.id]);

  const dispatch = () => {
    if (!unit) return;
    const now = new Date();
    setDispatchedAt(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    onDispatch(unit.id);
  };
  const notificationRoute = recommendedRoute ?? selectedRoute;
  const mainObstacles = notificationRoute?.obstacles.slice(0, 3) ?? [];

  return <div className="response-layout">
    <div className="response-heading"><div><button className="text-button" onClick={onBack}>← Back to incident</button><span className="eyebrow">RESPONSE &amp; ROUTING · {incident.id}</span><h2>{incident.title}</h2><p>{incident.location} · {incident.type}</p></div><div className="response-heading-tags"><SeverityTag severity={incident.severity} /><StatusTag status={dispatchStatus} /></div></div>
    <div className="response-context"><span><small>INCIDENT</small><b>{incident.title}</b></span><span><small>DEPARTMENT</small><b>{department.name}</b></span><span><small>UNIT</small><b>{unit?.id ?? "—"}</b></span><span><small>STATUS</small><StatusTag status={dispatchStatus} /></span></div>
    <div className="response-grid">
      <Panel title="Incident-aware road routing" eyebrow={`${department.name.toUpperCase()} · OPENSTREETMAP / OSRM`} className="response-map-panel"><DigitalTwinMap assets={infrastructureAssets} locations={monitoredLocations} layers={{ roads: true, buildings: true, hospitals: true, fire: true, police: true, electricity: true, water: true, emergency: true, locations: true }} selectedAsset={target} selectedLocation={null} onAsset={() => undefined} onLocation={() => undefined} route={selectedRoute ? { origin, target, option: selectedRoute, alternatives: routes, obstacles: selectedRoute.obstacles } : undefined} />{loading && <p className="route-loading">Calculating drivable routes from {origin.name}...</p>}{error && <div className="route-error"><b>Route calculation unavailable</b><span>{error}</span><button className="button button-secondary" onClick={() => void loadRoutes()}>Retry</button></div>}<div className="route-legend"><span><i className="route-dot base" />Base · {origin.name}</span><span><i className="route-dot incident" />Incident · {target.name}</span><span><i className="route-line-sample" />Recommended road route</span></div></Panel>
      <div className="response-side">
        <Panel title="Department response" eyebrow="RESPONSIBLE DEPARTMENT"><div className="response-department"><span className="asset-large">◆</span><div><h2>{department.name}</h2><p>Mapped from incident type: {incident.type}</p></div></div><div className="unit-list">{departmentUnits.map((availableUnit) => <button className={`unit-option ${availableUnit.id === unit?.id ? "selected" : ""}`} onClick={() => setUnitId(availableUnit.id)} key={availableUnit.id}><span><b>{availableUnit.name}</b><small>{availableUnit.id === unit?.id ? "Selected · " : ""}Base: {infrastructureAssets.find((asset) => asset.id === availableUnit.baseAssetId)?.name ?? "Response base"}</small></span><StatusTag status={availableUnit.id === unit?.id && responseStatus ? responseStatus : availableUnit.status} /></button>)}</div></Panel>
        <Panel title="Estimated response" eyebrow={recommendedRoute ? "LOWEST OPERATIONAL COST" : "AWAITING ROAD NETWORK"}>{recommendedRoute ? <><div className="eta-hero"><small>ESTIMATED RESPONSE</small><strong>{recommendedRoute.eta}</strong><span>{recommendedRoute.distance} · Primary ETA from OSRM</span></div><div className="route-metrics"><div><span>Risk score</span><b>{recommendedRoute.score}</b></div><div><span>Risk</span><b className={recommendedRoute.risk === "LOW" ? "text-green" : "text-orange"}>{recommendedRoute.risk}</b></div><div><span>Traffic</span><b>{recommendedRoute.traffic}</b></div><div><span>Blockage</span><b>{recommendedRoute.blockage}</b></div></div><p className="route-explanation">{recommendedRoute.name} is recommended because it has the lowest explainable operational score, not simply the shortest distance. {recommendedRoute.explanation}</p></> : <p className="muted-copy">Route calculation unavailable. No fake fallback geometry is shown.</p>}<button className="button button-primary full-button" disabled={!recommendedRoute || !unit} onClick={dispatch}>{dispatchStatus === "En Route" || dispatchStatus === "Dispatched" ? `${unit?.name} ${dispatchStatus}` : `Dispatch ${unit?.name ?? "response unit"}`}</button>{dispatchedAt && <p className="dispatch-confirmation">Dispatch confirmed at {dispatchedAt}. {unit?.name} is now assigned to this incident.</p>}</Panel>
        <Panel title="Department notification" eyebrow="IN-APP CRITICAL RESPONSE ALERT"><div className="response-alert"><b>CRITICAL RESPONSE ALERT</b><p><strong>Incident:</strong> {incident.title}<br /><strong>Department:</strong> {department.name}<br /><strong>Recommended unit:</strong> {unit?.id ?? "—"}<br /><strong>Recommended route:</strong> {notificationRoute?.name ?? "Pending"}<br /><strong>ETA:</strong> {notificationRoute?.eta ?? "Pending"}</p><span>Main obstacles: {mainObstacles.length ? mainObstacles.map((obstacle) => obstacle.name).join(" · ") : "None identified on route"}</span><p><strong>Recommended action:</strong> Dispatch {unit?.name ?? "available unit"} via {notificationRoute?.name ?? "the calculated route"}.</p></div></Panel>
        <Panel title="Route candidates" eyebrow="TRANSPARENT DECISION SUPPORT"><div className="route-options">{routes.map((route) => <button className={`route-option ${route.id === selectedRoute?.id ? "selected" : ""}`} onClick={() => setRouteId(route.id)} key={route.id}><span className="radio">{route.id === selectedRoute?.id ? "●" : "○"}</span><span><b>{route.name} {route.recommended ? "· RECOMMENDED" : ""}</b><small>{route.distance} · {route.traffic} traffic · score {route.score}</small></span><strong>{route.eta}<small>{route.risk} risk</small></strong></button>)}</div>{!routes.length && <p className="muted-copy">{loading ? "Calculating OSRM alternatives..." : "No route candidates available."}</p>}</Panel>
      </div>
    </div>
    <Panel title="Obstacles on selected route" eyebrow="MOCK INFRASTRUCTURE / INCIDENT ANALYSIS"><div className="obstacle-list">{selectedRoute?.obstacles.length ? selectedRoute.obstacles.map((obstacle) => <div className="obstacle-item" key={obstacle.id}><span className={`obstacle-risk ${obstacle.risk.toLowerCase()}`}>{obstacle.risk}</span><div><b>{obstacle.name}</b><small>{obstacle.type} · +{obstacle.effectMinutes} min estimated effect</small><p>Mitigation: {obstacle.mitigation}</p></div></div>) : <p className="muted-copy">No known obstacles intersect this route geometry.</p>}</div></Panel>
  </div>;
}
