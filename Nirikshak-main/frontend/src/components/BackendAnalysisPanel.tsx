import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { BackendIncidentAnalysis } from "../services/backendAnalysisService";
import { loadBackendIncidentAnalysis } from "../services/backendAnalysisService";
import type { Incident } from "../data/incidents";

type Props = { incident: Incident };

function Panel({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return <section className="panel">
    <div className="panel-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div></div>
    {children}
  </section>;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}

function causalChains(analysis: BackendIncidentAnalysis): string[][] {
  const paths = [...analysis.cascade.primaryImpacts, ...analysis.cascade.propagatedImpacts]
    .map((impact) => impact.dependencyPath)
    .filter((path) => path.length > 0);
  const longestPath = paths.reduce<string[]>((longest, path) => path.length > longest.length ? path : longest, []);
  if (longestPath.length > 0 && paths.every((path) => path.every((asset, index) => longestPath[index] === asset))) {
    return [longestPath];
  }
  return uniqueValues(paths.map((path) => path.join(" → ")).sort()).map((path) => path.split(" → "));
}

function conciseExplanation(text: string, assetNames: string[]): string {
  return assetNames.reduce((result, assetName) => {
    const escaped = assetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return result.replace(new RegExp(`(${escaped})(?: and \\1)+`, "gi"), "$1");
  }, text);
}

export default function BackendAnalysisPanel({ incident }: Props) {
  const [analysis, setAnalysis] = useState<BackendIncidentAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setAnalysis(null);

    void loadBackendIncidentAnalysis(incident.id, incident.severity, controller.signal)
      .then(setAnalysis)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Backend analysis unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [incident.id]);

  const chains = analysis ? causalChains(analysis) : [];
  const primaryAssets = analysis ? uniqueValues(analysis.cascade.primaryImpacts.map((impact) => impact.assetName)) : [];
  const routes = analysis?.routes ?? [];
  const routeCount = routes.length;
  const resource = analysis?.response.resourceRecommendations[0];
  const explanation = analysis
    ? conciseExplanation(analysis.cascade.explanation, [...analysis.cascade.primaryImpacts, ...analysis.cascade.propagatedImpacts].map((impact) => impact.assetName))
    : "";

  return (
    <Panel title="Live backend intelligence" eyebrow="CASCADE · RESPONSE · OSRM">
      {loading && <p className="muted-copy">Running cascade, response and route analysis...</p>}
      {error && <p className="muted-copy">Unable to load backend analysis: {error}</p>}
      {analysis && <div className="drawer-list">
        <span><b>WHAT HAPPENED</b> · {incident.title} · {primaryAssets.join(", ") || "No primary asset"}</span>
        <span><b>CASCADE</b> · {chains.map((chain) => chain.join(" → ")).join(" · ") || "No propagated cascade"}</span>
        <span><b>RISK</b> · {analysis.cascade.cascadeRiskScore} / 100 · {analysis.cascade.cascadeRiskLevel}</span>
        <span><b>RESPONSE</b> · {analysis.response.departments.map((department) => `${department.departmentName} — ${department.priority}`).join(" · ")}</span>
        <span><b>RESOURCE</b> · {resource ? `${resource.resourceName} · Available` : "No available resource recommendation"}</span>
        <span><b>ROUTES</b> · {routeCount} department-specific road route{routeCount === 1 ? "" : "s"}{analysis?.routeFailures.length ? ` · ${analysis.routeFailures.length} unavailable` : ""}</span>
        <span><b>WHY</b> · {explanation}</span>
      </div>}
    </Panel>
  );
}