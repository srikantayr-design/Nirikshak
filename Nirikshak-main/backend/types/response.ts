import type { CascadeAnalysisResult, CascadeImpact, CascadeRiskLevel } from "./cascade.ts";

export type ResponsePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ResponseIncident = {
  id: string;
  externalId: string;
  incidentType: string;
  severity: string;
};

export type ResponseAsset = {
  id: string;
  criticality: string;
};

export type ResponseDepartment = {
  id: string;
  code: string;
  name: string;
  incidentTypes: string[];
};

export type ResponseResource = {
  id: string;
  externalId: string;
  name: string;
  resourceType: string;
  status: string;
  departmentId: string | null;
  baseAssetId: string | null;
};

export type DepartmentRecommendation = {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  priority: ResponsePriority;
  reason: string;
  affectedAssetIds: string[];
  availableResourceCount: number;
};

export type ResourceRecommendation = {
  resourceId: string;
  resourceName: string;
  resourceExternalId: string;
  resourceType: string;
  departmentId: string;
  departmentName: string;
  reason: string;
  priorityRank: number;
};

export type ResourceAvailability = {
  departmentId: string;
  departmentName: string;
  availableResourceIds: string[];
  availableResourceNames: string[];
  unavailableResourceCount: number;
};

export type ResponseAnalysisResult = {
  incidentId: string;
  priority: ResponsePriority;
  departments: DepartmentRecommendation[];
  resourceRecommendations: ResourceRecommendation[];
  resourceAvailability: ResourceAvailability[];
  explanation: string;
};

export type ResponseDataSource = {
  findIncident(idOrExternalId: string): Promise<ResponseIncident | null>;
  listAssets(): Promise<ResponseAsset[]>;
  listDepartments(): Promise<ResponseDepartment[]>;
  listResources(): Promise<ResponseResource[]>;
};

export type ResponseEngineInput = {
  incident: ResponseIncident;
  cascade: CascadeAnalysisResult;
  assets: ResponseAsset[];
  departments: ResponseDepartment[];
  resources: ResponseResource[];
};

export type ResponseImpact = CascadeImpact & { assetId: string };
export type { CascadeAnalysisResult, CascadeRiskLevel };