import type { CascadeAnalysisResult } from "./cascade.ts";

export type RouteStatus = "CLEAR" | "CAUTION" | "BLOCKED";

export type RoutePoint = {
  latitude: number;
  longitude: number;
};

export type RouteGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

export type RoutingIncident = {
  id: string;
  externalId: string;
  severity: string;
  location: RoutePoint | null;
};

export type RoutingResource = {
  id: string;
  externalId: string;
  name: string;
  status: string;
  location: RoutePoint | null;
};

export type RoutingAsset = {
  id: string;
  externalId: string;
  name: string;
  assetType: string;
  status: string;
  criticality: string;
  location: RoutePoint | null;
};

export type RoutingImpact = {
  assetId: string;
  impactState: "current" | "predicted";
  impactType: string;
  severity: string | null;
  asset: RoutingAsset | null;
};

export type OsrmRoute = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: RouteGeometry;
};

export type RouteExposure = {
  assetId: string;
  assetExternalId: string;
  assetName: string;
  criticality: string;
  impactState: "current" | "predicted";
  impactType: string;
  impactSeverity: string | null;
  distanceMeters: number;
  blocked: boolean;
  reason: string;
};

export type RouteCandidate = {
  routeId: string;
  routeRank: number;
  distanceMeters: number;
  durationSeconds: number;
  geometry: RouteGeometry;
  riskScore: number;
  status: RouteStatus;
  exposures: RouteExposure[];
  explanation: string;
  recommended: boolean;
};

export type RouteAnalysisResult = {
  incidentId: string;
  resourceId: string;
  origin: RoutePoint;
  destination: RoutePoint;
  candidates: RouteCandidate[];
  recommendedRouteId: string | null;
  explanation: string;
};

export type RouteAnalysisInput = {
  incident: RoutingIncident;
  resource: RoutingResource;
  cascade: CascadeAnalysisResult;
  assets: RoutingAsset[];
  impacts: RoutingImpact[];
  routes: OsrmRoute[];
};

export type RoutingDataSource = {
  findIncident(idOrExternalId: string): Promise<RoutingIncident | null>;
  findResource(idOrExternalId: string): Promise<RoutingResource | null>;
  findAssets(): Promise<RoutingAsset[]>;
  findIncidentImpacts(incidentId: string): Promise<RoutingImpact[]>;
};

export type RouteEngineInput = {
  incident: RoutingIncident;
  resource: RoutingResource;
  cascade: CascadeAnalysisResult;
  assets: RoutingAsset[];
  impacts: RoutingImpact[];
  routes: OsrmRoute[];
};