import { useEffect, useRef, useState } from "react";
import type { Incident } from "../data/incidents";
import type { ScenarioComparison, ScenarioRecord } from "../../../backend/types/scenario.ts";
import { getIncidentScenarios, runIncidentScenario } from "../services/scenarioSimulationService";

type Props = { incident: Incident };

function Panel({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return <section className="panel">
    <div className="panel-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div></div>
    {children}
  </section>;
}

function routeStatus(snapshot: ScenarioComparison["baseline"]): string {
  const route = snapshot.route?.candidates.find((candidate) => candidate.recommended);
  return route ? `${route.status} · risk ${route.riskScore}` : "No route";
}

function routeEta(snapshot: ScenarioComparison["baseline"]): string {
  const route = snapshot.route?.candidates.find((candidate) => candidate.recommended);
  return route ? `${Math.ceil(route.durationSeconds / 60)} min` : "No route";
}

export default function ScenarioSimulationPanel({ incident }: Props) {
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [result, setResult] = useState<ScenarioComparison | null>(null);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const simulationController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setScenarios([]);
    setSelectedScenarioId("");
    setResult(null);
    setError(null);
    setLoadingScenarios(true);
    simulationController.current?.abort();
    simulationController.current = null;
    setRunning(false);
    void getIncidentScenarios(incident.id)
      .then((available) => {
        if (!controller.signal.aborted) setScenarios(available);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load scenarios.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingScenarios(false);
      });
    return () => {
      controller.abort();
      simulationController.current?.abort();
    };
  }, [incident.id]);

  const runScenario = () => {
    if (!selectedScenarioId) return;
    simulationController.current?.abort();
    const controller = new AbortController();
    simulationController.current = controller;
    setRunning(true);
    setError(null);
    void runIncidentScenario(incident.id, selectedScenarioId, controller.signal)
      .then(setResult)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Scenario simulation failed.");
      })
      .finally(() => {
        if (simulationController.current === controller) {
          simulationController.current = null;
          setRunning(false);
        }
      });
  };

  if (loadingScenarios) return <Panel title="What-if analysis" eyebrow="SCENARIO SIMULATOR"><p className="muted-copy">Loading scenarios for this incident...</p></Panel>;
  if (!scenarios.length && !error) return null;

  return <Panel title="What-if analysis" eyebrow="SCENARIO SIMULATOR">
    <div className="scenario-controls">
      <label>
        Scenario
        <select value={selectedScenarioId} onChange={(event) => { setSelectedScenarioId(event.target.value); setResult(null); setError(null); }}>
          <option value="">Select a hypothetical change</option>
          {scenarios.map((scenario) => <option key={scenario.externalId} value={scenario.externalId}>{scenario.name}</option>)}
        </select>
      </label>
      <button className="button button-secondary" disabled={!selectedScenarioId || running} onClick={runScenario}>{running ? "Simulating..." : "Run simulation"}</button>
    </div>
    {error && <p className="muted-copy">Unable to complete scenario simulation: {error}</p>}
    {result && <div className="drawer-list">
      <span><b>REAL CURRENT STATE</b> · Cascade {result.baseline.cascade.cascadeRiskScore} / 100 · {result.baseline.cascade.cascadeRiskLevel} · Response {result.baseline.response.priority} · Route {routeStatus(result.baseline)} ({routeEta(result.baseline)})</span>
      <span><b>HYPOTHETICAL SIMULATED STATE</b> · Cascade {result.simulated.cascade.cascadeRiskScore} / 100 · {result.simulated.cascade.cascadeRiskLevel} · Response {result.simulated.response.priority} · Route {routeStatus(result.simulated)} ({routeEta(result.simulated)})</span>
      <span><b>CHANGE</b> · {result.changes.newlyAffectedAssets.length ? `Newly affected: ${result.changes.newlyAffectedAssets.join(", ")}. ` : "No additional cascade impact predicted because these assets are already affected in the current incident. "}{result.changes.noLongerAvailableRoutes.length ? `Newly unavailable routes: ${result.changes.noLongerAvailableRoutes.join(", ")}. ` : "No newly unavailable routes. "}{result.changes.riskChange === 0 ? "Cascade risk unchanged." : `Cascade risk changed by ${result.changes.riskChange}.`}</span>
      <span><b>WHY</b> · {result.explanation}</span>
      <button className="button button-secondary" onClick={() => setResult(null)}>Return to baseline</button>
    </div>}
  </Panel>;
}