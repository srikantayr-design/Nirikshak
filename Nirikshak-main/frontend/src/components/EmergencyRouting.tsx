import { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { Asset, Incident, Severity } from "../data/incidents";
import type { RouteAnalysisResult, RouteCalculationFailure } from "../../../backend/types/routing.ts";
import { loadBackendIncidentAnalysis } from "../services/backendAnalysisService";
import DigitalTwinMap from "./DigitalTwinMap";

type Props = {
  incident: Incident;
  assets: Asset[];
  onBack: () => void;
  responseStatus?: string;
  onDispatch: (unitId: string) => void;
  SeverityTag: (props: { severity: Severity }) => ReactElement;
  StatusTag: (props: { status: string }) => ReactElement;
  Panel: (props: { title: string; eyebrow?: string; children: ReactNode; className?: string }) => ReactElement;
};

type DisplayRoute = {
  id: string;
  name: string;
  departmentName: string;
  routePurpose: string;
  resourceId: string;
  origin: Asset;
  target: Asset;
  distance: string;
  eta: string;
  risk: string;
  traffic: string;
  blockage: string;
  hazard: string;
  explanation: string;
  offset: number;
  geometry?: Asset["connectedAssets"] extends never ? never : { type: "LineString"; coordinates: [number, number][] };
  routeRank: number;
  recommended: boolean;
  score: number;
  obstacles: Array<{ id: string; name: string; type: string; risk: "LOW" | "MEDIUM" | "HIGH"; lat: number; lng: number; effectMinutes: number; mitigation: string; assetId?: string }>;
};

function assetForRoute(assets: Asset[], route: RouteAnalysisResult, fallback: Asset | undefined): Asset | undefined {
  return assets.find((asset) => asset.id === route.destinationAssetId) ?? fallback;
}

export default function EmergencyRouting({ incident, assets, onBack, responseStatus, onDispatch, SeverityTag, StatusTag, Panel }: Props) {
  const [analysisRoutes, setAnalysisRoutes] = useState<RouteAnalysisResult[]>([]);
  const [routeFailures, setRouteFailures] = useState<RouteCalculationFailure[]>([]);
  const [routes, setRoutes] = useState<DisplayRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dispatchedAt, setDispatchedAt] = useState<string | null>(null);

  const fallbackTarget = incident.affectedInfrastructure
    .map((name) => assets.find((asset) => asset.name === name))
    .find((asset): asset is Asset => Boolean(asset?.lat != null && asset.lng != null));
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];
  const dispatchStatus = responseStatus ?? (dispatchedAt ? "En Route" : "Awaiting route");
  const relevantAssetIds = new Set([
    ...incident.affectedInfrastructure.map((name) => assets.find((asset) => asset.name === name)?.id).filter((id): id is string => Boolean(id)),
    ...routes.flatMap((route) => [route.origin.id, route.target.id]),
  ]);
  const mapAssets = assets.filter((asset) => relevantAssetIds.has(asset.id) || ["HOSPITAL", "FIRE STATION", "POLICE", "EMERGENCY CENTRE"].includes(asset.type));

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setAnalysisRoutes([]);
    setRouteFailures([]);
    setRoutes([]);
    setSelectedRouteId("");
    setDispatchedAt(null);

    void loadBackendIncidentAnalysis(incident.id, incident.severity, controller.signal)
      .then((analysis) => {
        if (controller.signal.aborted) return;
        setAnalysisRoutes(analysis.routes);
        setRouteFailures(analysis.routeFailures);
        const displayRoutes = analysis.routes.flatMap((analysisRoute) => {
          const candidate = analysisRoute.candidates.find((item) => item.recommended) ?? analysisRoute.candidates[0];
          const target = assetForRoute(assets, analysisRoute, fallbackTarget);
          if (!candidate || !target) return [];
          const origin = assets.find((asset) => asset.id === analysisRoute.originAssetId) ?? {
            id: analysisRoute.resourceId,
            name: analysisRoute.resourceId,
            type: "RESPONSE RESOURCE",
            status: "AVAILABLE",
            detail: "Stored response resource location",
            x: 50,
            y: 50,
            lat: analysisRoute.origin.latitude,
            lng: analysisRoute.origin.longitude,
          } satisfies Asset;
          const obstacles = candidate.exposures.flatMap((exposure) => {
            const asset = assets.find((item) => item.id === exposure.assetExternalId);
            if (!asset || asset.lat == null || asset.lng == null) return [];
            return [{
              id: exposure.assetExternalId,
              name: exposure.assetName,
              type: exposure.impactType,
              risk: exposure.blocked ? "HIGH" as const : "MEDIUM" as const,
              lat: asset.lat,
              lng: asset.lng,
              effectMinutes: Math.ceil(exposure.distanceMeters / 100),
              mitigation: exposure.reason,
              assetId: exposure.assetExternalId,
            }];
          });
          return [{
            id: `${analysisRoute.incidentId}-${analysisRoute.departmentCode}-${analysisRoute.resourceId}`,
            name: `${analysisRoute.departmentName ?? analysisRoute.departmentCode ?? "Response"} route`,
            departmentName: analysisRoute.departmentName ?? analysisRoute.departmentCode ?? "Response",
            routePurpose: analysisRoute.routePurpose ?? "operational_response",
            resourceId: analysisRoute.resourceId,
            origin,
            target,
            distance: `${(candidate.distanceMeters / 1000).toFixed(1)} km`,
            eta: `${Math.ceil(candidate.durationSeconds / 60)} min`,
            risk: candidate.status === "BLOCKED" ? "HIGH" : candidate.status === "CAUTION" ? "MEDIUM" : "LOW",
            traffic: candidate.exposures.length ? "Affected" : "Clear",
            blockage: `${candidate.exposures.filter((exposure) => exposure.blocked).length * 25}%`,
            hazard: candidate.exposures.length ? "Infrastructure exposure" : "No known exposure",
            explanation: candidate.explanation,
            offset: 0,
            geometry: candidate.geometry,
            routeRank: candidate.routeRank,
            recommended: true,
            score: candidate.riskScore,
            obstacles,
          } satisfies DisplayRoute];
        });
        console.log(
  "NIRIKSHAK DISPLAY ROUTES:",
  displayRoutes.map((route) => ({
    department: route.departmentName,
    origin: route.origin.name,
    target: route.target.name,
    routeId: route.id,
  }))
);

setRoutes(displayRoutes);
setSelectedRouteId(displayRoutes[0]?.id ?? "");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Route calculation unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [incident.id, incident.severity, assets]);

  const dispatch = () => {
    if (!selectedRoute) return;
    setDispatchedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    onDispatch(selectedRoute.resourceId);
  };

  return <div className="response-layout">
    <div className="response-heading">
      <div><button className="text-button" onClick={onBack}>← Back to incident</button><span className="eyebrow">RESPONSE &amp; ROUTING · {incident.id}</span><h2>{incident.title}</h2><p>{incident.location} · {incident.type}</p></div>
      <div className="response-heading-tags"><SeverityTag severity={incident.severity} /><StatusTag status={dispatchStatus} /></div>
    </div>
    <div className="response-context"><span><small>INCIDENT</small><b>{incident.title}</b></span><span><small>ROUTES</small><b>{routes.length} department-specific</b></span><span><small>SEVERITY</small><SeverityTag severity={incident.severity} /></span><span><small>STATUS</small><StatusTag status={dispatchStatus} /></span></div>
    <div className="response-grid">
      <Panel title="Multi-department road routing" eyebrow="OSRM · STORED RESOURCES · STORED DESTINATIONS" className="response-map-panel">
        <DigitalTwinMap assets={mapAssets} locations={[]} layers={{ roads: true, buildings: true, hospitals: true, fire: true, police: true, electricity: true, water: true, emergency: true, fuel: true }} selectedAsset={selectedRoute?.target ?? fallbackTarget ?? null} selectedLocation={null} onAsset={() => undefined} onLocation={() => undefined} routes={routes.map((route) => ({ origin: route.origin, target: route.target, option: route, obstacles: route.obstacles, label: `${route.departmentName} · ${route.routePurpose}` }))} />
        {loading && <p className="route-loading">Calculating {analysisRoutes.length || "department"} independent OSRM routes...</p>}
        {error && <div className="route-error"><b>Route calculation unavailable</b><span>{error}</span></div>}
        {!loading && !error && !routes.length && routeFailures.length > 0 && <div className="route-error"><b>Route calculation unavailable</b><span>All department route calculations failed. No replacement route was generated.</span></div>}
        <div className="route-legend"><span><i className="route-line-sample" />Blue road-network routes by department</span>{routes.map((route) => <small key={route.id}>{route.departmentName} · {route.routePurpose}</small>)}</div>
      </Panel>
      <div className="response-side">
        <Panel title="Department response" eyebrow="RELEVANT OPERATIONAL ASSIGNMENTS">
          <div className="unit-list">{routes.map((route) => <div className="unit-option selected" key={route.id}><span><b>{route.departmentName}</b><small>{route.routePurpose} · {route.origin.name} → {route.target.name}</small></span><StatusTag status="ROUTE READY" /></div>)}{routeFailures.map((failure) => <div className="unit-option" key={failure.assignmentId}><span><b>{failure.departmentName ?? failure.departmentCode ?? "Department"}</b><small>{failure.routePurpose ?? "route"} · {failure.resourceExternalId ?? failure.resourceId ?? "resource unavailable"}</small></span><StatusTag status="ROUTE UNAVAILABLE" /></div>)}</div>
          {!routes.length && !routeFailures.length && !loading && <p className="muted-copy">No active department route is associated with this incident.</p>}
        </Panel>
        <Panel title="Selected route" eyebrow={selectedRoute ? `${selectedRoute.departmentName.toUpperCase()} · ${selectedRoute.routePurpose.toUpperCase()}` : "AWAITING ROUTES"}>
          {selectedRoute ? <><div className="eta-hero"><small>ESTIMATED RESPONSE</small><strong>{selectedRoute.eta}</strong><span>{selectedRoute.distance} · {selectedRoute.origin.name} → {selectedRoute.target.name}</span></div><div className="route-metrics"><div><span>Risk score</span><b>{selectedRoute.score}</b></div><div><span>Risk</span><b>{selectedRoute.risk}</b></div><div><span>Traffic</span><b>{selectedRoute.traffic}</b></div><div><span>Blockage</span><b>{selectedRoute.blockage}</b></div></div><p className="route-explanation">{selectedRoute.explanation}</p><button className="button button-primary full-button" onClick={dispatch}>{dispatchedAt ? `Route dispatched at ${dispatchedAt}` : `Dispatch ${selectedRoute.departmentName}`}</button></> : <p className="muted-copy">No route selected.</p>}
        </Panel>
        <Panel title="Department routes" eyebrow="SEPARATE ROAD-NETWORK OPTIONS">
          <div className="route-options">{routes.map((route) => <button className={`route-option ${route.id === selectedRoute?.id ? "selected" : ""}`} onClick={() => setSelectedRouteId(route.id)} key={route.id}><span className="radio">{route.id === selectedRoute?.id ? "●" : "○"}</span><span><b>{route.departmentName} · {route.routePurpose}</b><small>{route.origin.name} → {route.target.name} · {route.distance} · {route.traffic}</small></span><strong>{route.eta}<small>{route.risk} risk</small></strong></button>)}</div>
        </Panel>
      </div>
    </div>
    <Panel title="Assets exposed on selected route" eyebrow="BACKEND IMPACT RELATIONSHIPS"><div className="obstacle-list">{selectedRoute?.obstacles.length ? selectedRoute.obstacles.map((obstacle) => <div className="obstacle-item" key={obstacle.id}><span className={`obstacle-risk ${obstacle.risk.toLowerCase()}`}>{obstacle.risk}</span><div><b>{obstacle.name}</b><small>{obstacle.type} · +{obstacle.effectMinutes} min estimated effect</small><p>{obstacle.mitigation}</p></div></div>) : <p className="muted-copy">No impacted backend asset intersects the selected route.</p>}{routeFailures.length > 0 && <p className="muted-copy">Unavailable department routes: {routeFailures.map((failure) => `${failure.departmentName ?? failure.departmentCode ?? "Department"} (${failure.message})`).join(" · ")}</p>}</div></Panel>
  </div>;
}
