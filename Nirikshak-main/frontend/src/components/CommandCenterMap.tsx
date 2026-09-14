import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Asset, Incident } from "../data/incidents";
import { MAP_CONFIG } from "../config";
import { loadPreferences } from "../preferences";

type CommandCenterMapProps = {
  incident: Incident;
  assets: Asset[];
  onAsset?: (asset: Asset) => void;
};

const assetIcon = (asset: Asset) => {
  const icon = asset.type === "HOSPITAL" ? "🏥" : asset.type === "FIRE STATION" ? "🚒" : asset.type === "POLICE" ? "🚓" : asset.type === "ROAD" ? "🚧" : asset.type === "ELECTRICITY" ? "⚡" : asset.type === "WATER" || asset.type === "WATER MAIN" ? "💧" : asset.type === "FUEL STATION" ? "⛽" : asset.type === "EMERGENCY CENTRE" ? "✚" : "🏢";
  return L.divIcon({
    className: "command-asset-marker-wrapper",
    html: `<span class="command-asset-marker command-asset-${asset.type.toLowerCase().replaceAll(" ", "-")}">${icon}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
};

const incidentIcon = (incident: Incident) => {
  const type = incident.type.toUpperCase();
  const icon = type.includes("FUEL") || incident.title.toUpperCase().includes("PETROL") ? "⛽"
    : type.includes("FIRE") ? "🔥"
    : type.includes("POWER") || type.includes("ELECTRIC") ? "⚡"
      : type.includes("TRANSPORT") || type.includes("ROAD") ? "🚧"
        : type.includes("WATER") ? "💧"
          : type.includes("COLLAPSE") || type.includes("STRUCTURAL") ? "🏚️"
            : type.includes("ACCIDENT") || type.includes("GAS") || type.includes("HAZARD") ? "☣"
              : "⚠";
  return L.divIcon({
  className: "command-incident-marker-wrapper",
    html: `<span class="command-incident-marker command-incident-${type.toLowerCase().replaceAll(" ", "-")}"><i>${icon}</i></span>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  });
};

const popupContent = (asset: Asset, incident: Incident, relatedAssetIds: string[]) => {
  const affectedReason = incident.affectedInfrastructure.includes(asset.name) ? `Affected by ${incident.title.toLowerCase()} impact analysis.` : relatedAssetIds.includes(asset.id) ? `Connected to infrastructure affected by ${incident.title.toLowerCase()}.` : "Emergency resource supporting the active response.";
  return `<div class="command-popup"><strong>${asset.name}</strong><dl><dt>Type</dt><dd>${asset.type}</dd><dt>Status</dt><dd>${asset.status}</dd><dt>Risk</dt><dd>${asset.currentRisk ?? 0}%</dd><dt>Criticality</dt><dd>${asset.criticality ?? "MEDIUM"}</dd><dt>Reason</dt><dd>${affectedReason}</dd><dt>Potential consequence</dt><dd>${asset.potentialConsequence ?? asset.detail}</dd></dl></div>`;
};

export default function CommandCenterMap({ incident, assets, onAsset }: CommandCenterMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const focusRef = useRef<() => void>(() => undefined);

  const primaryAffectedIds = assets.filter((asset) => incident.affectedInfrastructure.includes(asset.name)).map((asset) => asset.id);
  const affectedAssets = assets.filter((asset) => (incident.affectedInfrastructure.includes(asset.name) || asset.connectedAssets?.some((id) => primaryAffectedIds.includes(id))) && asset.lat != null && asset.lng != null);
  const primaryAffectedCount = primaryAffectedIds.length;
  const incidentPoint = incident.locationCoordinates;
  const emergencyAssets = assets.filter((asset) => ["FIRE STATION", "HOSPITAL", "EMERGENCY CENTRE"].includes(asset.type) && asset.lat != null && asset.lng != null);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;
    const map = L.map(mapElement.current, { zoomControl: true }).setView(MAP_CONFIG.center, MAP_CONFIG.defaultZoom);
    const tileUrl = loadPreferences().defaultMapLayer === "satellite" ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    L.tileLayer(tileUrl, { attribution: loadPreferences().defaultMapLayer === "satellite" ? "Tiles © Esri" : "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !incidentPoint) return;
    const layer = L.layerGroup().addTo(map);
    const incidentCoordinates = [incidentPoint.lat, incidentPoint.lng] as [number, number];
    const impactedPoints = affectedAssets.map((asset) => [asset.lat!, asset.lng!] as [number, number]);

    L.circle(incidentCoordinates, { radius: 900, color: "#dfb840", fillColor: "#dfb840", fillOpacity: 0.08, weight: 1, dashArray: "6 8" }).bindTooltip("MONITORING ZONE").addTo(layer);
    L.circle(incidentCoordinates, { radius: 500, color: "#ed9b51", fillColor: "#ed9b51", fillOpacity: 0.1, weight: 1.5, dashArray: "5 6" }).bindTooltip("SECONDARY IMPACT ZONE").addTo(layer);
    L.circle(incidentCoordinates, { radius: 250, color: "#f06455", fillColor: "#f06455", fillOpacity: 0.16, weight: 2 }).bindTooltip("PRIMARY IMPACT ZONE").addTo(layer);

    const incidentMarker = L.marker(incidentCoordinates, { icon: incidentIcon(incident), zIndexOffset: 1000 }).bindPopup(`<strong>${incident.title}</strong><br />Severity: ${incident.severity}<br />Status: ${incident.status}`);
    incidentMarker.addTo(layer);

    affectedAssets.forEach((asset) => {
      const marker = L.marker([asset.lat!, asset.lng!], { icon: assetIcon(asset), title: asset.name, zIndexOffset: 900 });
      marker.bindPopup(popupContent(asset, incident, affectedAssets.map((affectedAsset) => affectedAsset.id)));
      marker.on("click", () => onAsset?.(asset));
      marker.addTo(layer);
    });

    emergencyAssets.filter((asset) => !affectedAssets.some((affected) => affected.id === asset.id)).forEach((asset) => {
      L.marker([asset.lat!, asset.lng!], { icon: assetIcon(asset), title: asset.name, opacity: 0.82 }).bindPopup(popupContent(asset, incident, affectedAssets.map((affectedAsset) => affectedAsset.id))).addTo(layer);
    });

    const focusIncident = () => {
      const bounds = L.latLngBounds([incidentPoint, ...impactedPoints]);
      map.fitBounds(bounds.pad(0.22), { maxZoom: 16, animate: true });
    };
    focusRef.current = focusIncident;
    focusIncident();
    const refresh = loadPreferences().mapAutoRefresh ? window.setInterval(() => map.invalidateSize(), 30000) : undefined;
    return () => { if (refresh) window.clearInterval(refresh); layer.clearLayers(); map.removeLayer(layer); };
  }, [affectedAssets, emergencyAssets, incident, incidentPoint, onAsset]);

  return <div className="command-map-shell">
    <div ref={mapElement} className="leaflet-command-map" aria-label="Command Center operational map" />
    <div className="command-map-context"><span><small>ACTIVE INCIDENT</small><b>{incident.title}</b></span><span><small>SEVERITY</small><b className="command-critical">{incident.severity}</b></span><span><small>AFFECTED ASSETS</small><b>{primaryAffectedCount}</b></span><span><small>SECONDARY RISKS</small><b>{incident.cascade.branches.length + 1}</b></span><span><small>RESPONSE STATUS</small><b>{incident.responsibleDepartments[0]} Responding</b></span></div>
    <div className="command-map-actions"><button type="button" onClick={() => focusRef.current()}>Focus Incident</button><button type="button" onClick={() => mapRef.current?.setView(MAP_CONFIG.center, MAP_CONFIG.defaultZoom)}>Recenter</button></div>
    <div className="command-map-legend"><b>OPERATIONAL LEGEND</b><span><i className="legend-symbol legend-incident" />Active incident</span><span><i className="legend-symbol legend-asset" />Affected infrastructure</span><span><i className="legend-symbol legend-high" />High-risk zone</span><span><i className="legend-symbol legend-secondary" />Secondary impact zone</span><span><i className="legend-symbol legend-monitoring" />Monitoring zone</span><span><i className="legend-symbol legend-facility" />Emergency facility</span><span><i className="legend-symbol legend-blockage" />Road blockage</span></div>
  </div>;
}
