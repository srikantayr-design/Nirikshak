import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Asset, MonitoredLocation, RouteOption } from "../data/incidents";
import type { Obstacle } from "../data/routing";
import { MAP_CONFIG } from "../config";
import { loadPreferences } from "../preferences";

type MapLayerState = Record<string, boolean>;

type DigitalTwinMapProps = {
  assets: Asset[];
  locations: MonitoredLocation[];
  layers: MapLayerState;
  selectedAsset: Asset | null;
  selectedLocation: MonitoredLocation | null;
  onAsset: (asset: Asset) => void;
  onLocation: (location: MonitoredLocation) => void;
  route?: { origin: Asset; target: Asset; option: RouteOption; alternatives?: RouteOption[]; obstacles?: Obstacle[]; label?: string };
  routes?: Array<{ origin: Asset; target: Asset; option: RouteOption; alternatives?: RouteOption[]; obstacles?: Obstacle[]; label?: string }>;
};

const iconFor = (type: string, selected: boolean) => L.divIcon({
  className: "digital-marker-wrapper",
  html: `<span class="digital-marker digital-marker-${type.toLowerCase().replaceAll(" ", "-")} ${selected ? "digital-marker-selected" : ""}">${type === "HOSPITAL" ? "+" : type === "ROAD" ? "×" : type === "FIRE STATION" ? "F" : type === "POLICE" ? "P" : type === "WATER" || type === "WATER MAIN" ? "W" : type === "ELECTRICITY" ? "E" : type === "FUEL STATION" ? "⛽" : "◇"}</span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export default function DigitalTwinMap({ assets, locations, layers, selectedAsset, selectedLocation, onAsset, onLocation, route, routes }: DigitalTwinMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRefs = useRef<Record<string, L.LayerGroup>>({});

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
    if (!map) return;
    Object.values(layerRefs.current).forEach((layer) => { layer.clearLayers(); map.removeLayer(layer); });
    const assetGroups: Record<string, L.LayerGroup> = {};
    const locationGroup = L.layerGroup();
    const roadGroup = L.layerGroup();
    const buildingGroup = L.layerGroup();
    const routeGroup = L.layerGroup();
    layerRefs.current = { locations: locationGroup, roads: roadGroup, buildings: buildingGroup };

    assets.forEach((asset) => {
      const groupName = asset.type === "HOSPITAL" ? "hospitals" : asset.type === "FIRE STATION" ? "fire" : asset.type === "POLICE" ? "police" : asset.type === "ELECTRICITY" ? "electricity" : asset.type === "WATER" || asset.type === "WATER MAIN" ? "water" : asset.type === "FUEL STATION" ? "fuel" : asset.type === "EMERGENCY CENTRE" ? "emergency" : asset.type === "ROAD" ? "roads" : "buildings";
      assetGroups[groupName] ??= L.layerGroup();
      if (asset.lat == null || asset.lng == null) return;
      const marker = L.marker([asset.lat, asset.lng], { icon: iconFor(asset.type, selectedAsset?.id === asset.id), title: asset.name });
      marker.on("click", () => onAsset(asset));
      marker.bindTooltip(asset.name, { direction: "top", offset: [0, -12] });
      assetGroups[groupName].addLayer(marker);
    });

    const routeItems = routes ?? (route ? [route] : []);
    routeItems.forEach((routeItem, routeIndex) => {
      if (!routeItem.option.geometry || routeItem.origin.lat == null || routeItem.origin.lng == null || routeItem.target.lat == null || routeItem.target.lng == null) return;
      const start = [routeItem.origin.lat, routeItem.origin.lng] as [number, number];
      const end = [routeItem.target.lat, routeItem.target.lng] as [number, number];
      const drawRoute = (option: RouteOption, color: string, weight: number, opacity: number, dashArray?: string) => {
        if (!option.geometry) return;
        const coordinates = option.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        return L.polyline(coordinates, { color, weight, opacity, dashArray }).addTo(routeGroup);
      };
      routeItem.alternatives?.filter((option) => option.id !== routeItem.option.id).forEach((option) => drawRoute(option, "#8ca2a6", 3, 0.45, "5 8"));
      const routeColor = ["#2563eb", "#1d4ed8", "#3b82f6", "#60a5fa"][routeIndex % 4];
      drawRoute(routeItem.option, routeColor, 9, 0.3);
      drawRoute(routeItem.option, routeColor, 4, 1);
      L.circleMarker(start, { radius: 8, color: "#65c58d", fillColor: "#65c58d", fillOpacity: 1 }).bindTooltip(`${routeItem.label ?? "RESPONSE"} · BASE · ${routeItem.origin.name}`).addTo(routeGroup);
      L.circleMarker(end, { radius: 9, color: routeColor, fillColor: routeColor, fillOpacity: 1 }).bindTooltip(`${routeItem.label ?? "INCIDENT"} · ${routeItem.target.name}`).addTo(routeGroup);
      routeItem.obstacles?.forEach((obstacle) => {
        L.circleMarker([obstacle.lat, obstacle.lng], { radius: 8, color: obstacle.risk === "HIGH" ? "#f06455" : "#ed9b51", fillColor: obstacle.risk === "HIGH" ? "#f06455" : "#ed9b51", fillOpacity: 0.9, weight: 2 })
          .bindPopup(`<strong>${obstacle.name}</strong><br />${obstacle.type}<br />Risk: ${obstacle.risk}<br />Estimated effect: +${obstacle.effectMinutes} min<br />Mitigation: ${obstacle.mitigation}`)
          .bindTooltip(`OBSTACLE · ${obstacle.name}`)
          .addTo(routeGroup);
      });
    });

    locations.forEach((location) => {
      const marker = L.circleMarker([location.lat, location.lng], { radius: selectedLocation?.id === location.id ? 12 : 9, color: location.risk === "HIGH" ? "#f06455" : "#e4c66a", fillColor: location.risk === "HIGH" ? "#f06455" : "#e4c66a", fillOpacity: 0.18, weight: 2 });
      marker.on("click", () => onLocation(location));
      marker.bindTooltip(`${location.name} · ${location.risk} risk`, { direction: "top" });
      locationGroup.addLayer(marker);
    });

    Object.entries({ ...assetGroups, locations: locationGroup, roads: roadGroup, buildings: buildingGroup, route: routeGroup }).forEach(([name, layer]) => {
      layerRefs.current[name] = layer;
      if (layers[name] !== false) layer.addTo(map);
    });
    const refresh = loadPreferences().mapAutoRefresh ? window.setInterval(() => map.invalidateSize(), 30000) : undefined;
    return () => { if (refresh) window.clearInterval(refresh); };
  }, [assets, locations, layers, selectedAsset, selectedLocation, onAsset, onLocation, route, routes]);

  return <div ref={mapElement} className="leaflet-twin-map" aria-label="Interactive Digital Twin map" />;
}
