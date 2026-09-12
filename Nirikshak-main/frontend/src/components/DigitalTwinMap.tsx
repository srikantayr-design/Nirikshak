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
  route?: { origin: Asset; target: Asset; option: RouteOption; alternatives?: RouteOption[]; obstacles?: Obstacle[] };
};

const iconFor = (type: string, selected: boolean) => L.divIcon({
  className: "digital-marker-wrapper",
  html: `<span class="digital-marker digital-marker-${type.toLowerCase().replaceAll(" ", "-")} ${selected ? "digital-marker-selected" : ""}">${type === "HOSPITAL" ? "+" : type === "ROAD" ? "×" : type === "FIRE STATION" ? "F" : type === "POLICE" ? "P" : type === "WATER" ? "W" : type === "ELECTRICITY" ? "E" : "◇"}</span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export default function DigitalTwinMap({ assets, locations, layers, selectedAsset, selectedLocation, onAsset, onLocation, route }: DigitalTwinMapProps) {
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
      const groupName = asset.type === "HOSPITAL" ? "hospitals" : asset.type === "FIRE STATION" ? "fire" : asset.type === "POLICE" ? "police" : asset.type === "ELECTRICITY" ? "electricity" : asset.type === "WATER" ? "water" : asset.type === "EMERGENCY CENTRE" ? "emergency" : asset.type === "ROAD" ? "roads" : "buildings";
      assetGroups[groupName] ??= L.layerGroup();
      const marker = L.marker([asset.lat ?? 0, asset.lng ?? 0], { icon: iconFor(asset.type, selectedAsset?.id === asset.id), title: asset.name });
      marker.on("click", () => onAsset(asset));
      marker.bindTooltip(asset.name, { direction: "top", offset: [0, -12] });
      assetGroups[groupName].addLayer(marker);
    });

    assets.filter((asset) => asset.type === "ROAD").forEach((asset, index) => {
      L.polyline([[asset.lat ?? 0, (asset.lng ?? 0) - 0.0025], [asset.lat ?? 0, (asset.lng ?? 0) + 0.0035]], { color: index % 2 ? "#ed9b51" : "#d9c889", weight: 4, opacity: 0.8 }).addTo(roadGroup);
    });
    assets.filter((asset) => asset.type === "BUILDING").forEach((asset) => {
      L.polygon([[asset.lat! - 0.00045, asset.lng! - 0.00055], [asset.lat! - 0.00045, asset.lng! + 0.00055], [asset.lat! + 0.00045, asset.lng! + 0.00055], [asset.lat! + 0.00045, asset.lng! - 0.00055]], { color: "#6d9d9b", fillColor: "#28575c", fillOpacity: 0.35, weight: 1 }).bindTooltip(`${asset.name} footprint`).addTo(buildingGroup);
    });

    if (route?.option.geometry && route.origin.lat && route.origin.lng && route.target.lat && route.target.lng) {
      const start = [route.origin.lat, route.origin.lng] as [number, number];
      const end = [route.target.lat, route.target.lng] as [number, number];
      const drawRoute = (option: RouteOption, color: string, weight: number, opacity: number, dashArray?: string) => {
        if (!option.geometry) return;
        const coordinates = option.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        return L.polyline(coordinates, { color, weight, opacity, dashArray }).addTo(routeGroup);
      };
      route.alternatives?.filter((option) => option.id !== route.option.id).forEach((option) => drawRoute(option, "#8ca2a6", 3, 0.55, "5 8"));
      drawRoute(route.option, "#3bc5b5", 9, 0.3);
      drawRoute(route.option, "#3bc5b5", 4, 1);
      L.circleMarker(start, { radius: 8, color: "#65c58d", fillColor: "#65c58d", fillOpacity: 1 }).bindTooltip(`BASE · ${route.origin.name}`).addTo(routeGroup);
      L.circleMarker(end, { radius: 9, color: "#f06455", fillColor: "#f06455", fillOpacity: 1 }).bindTooltip(`INCIDENT · ${route.target.name}`).addTo(routeGroup);
      route.obstacles?.forEach((obstacle) => {
        L.circleMarker([obstacle.lat, obstacle.lng], { radius: 8, color: obstacle.risk === "HIGH" ? "#f06455" : "#ed9b51", fillColor: obstacle.risk === "HIGH" ? "#f06455" : "#ed9b51", fillOpacity: 0.9, weight: 2 })
          .bindPopup(`<strong>${obstacle.name}</strong><br />${obstacle.type}<br />Risk: ${obstacle.risk}<br />Estimated effect: +${obstacle.effectMinutes} min<br />Mitigation: ${obstacle.mitigation}`)
          .bindTooltip(`OBSTACLE · ${obstacle.name}`)
          .addTo(routeGroup);
      });
    }

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
  }, [assets, locations, layers, selectedAsset, selectedLocation, onAsset, onLocation, route]);

  return <div ref={mapElement} className="leaflet-twin-map" aria-label="Interactive Digital Twin map" />;
}
