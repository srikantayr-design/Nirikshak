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
  return route ? `${route.status.toLowerCase()} (route risk ${route.riskScore} / 100)` : "no route available";
}

function routeEta(snapshot: ScenarioComparison["baseline"]): string {
  const route = snapshot.route?.candidates.find((candidate) => candidate.recommended);
  return route ? `${Math.ceil(route.durationSeconds / 60)} min` : "No route";
}

function routeChange(result: ScenarioComparison): string {
  if (result.changes.noLongerAvailableRoutes.length) {
    return `The following route options would no longer be available: ${result.changes.noLongerAvailableRoutes.join(", ")}.`;
  }
  if (result.changes.etaChangeSeconds === null) return "No route change could be assessed.";
  if (result.changes.etaChangeSeconds === 0) return "The recommended route time would remain the same.";
  const direction = result.changes.etaChangeSeconds > 0 ? "longer" : "shorter";
  return `The recommended route would become ${Math.abs(result.changes.etaChangeSeconds)} seconds ${direction}.`;
}

function resultLabel(result: ScenarioComparison): string {
  if (result.changes.riskChange < 0) return "BETTER";
  if (result.changes.riskChange > 0) return "WORSE";
  return "NO SIGNIFICANT CHANGE";
}

function resultReason(result: ScenarioComparison): string {
  if (result.changes.riskChange < 0) return "The action would reduce the overall impact risk.";
  if (result.changes.riskChange > 0) return "The action would increase the overall impact risk and needs careful coordination.";
  return "The action would not materially change the overall impact risk.";
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
    void runIncidentScenario(incident.id, selectedScenarioId, incident.severity, controller.signal)
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
      <span><b>CURRENT SITUATION</b> · {incident.title} is currently being managed. Overall impact risk is {result.baseline.cascade.cascadeRiskScore} / 100 ({result.baseline.cascade.cascadeRiskLevel}), response priority is {result.baseline.response.priority}, and the recommended route is {routeStatus(result.baseline)} ({routeEta(result.baseline)}).</span>
      <span><b>SIMULATED ACTION</b> · This hypothetical simulation tests: {result.scenarioName}.</span>
      <span><b>EXPECTED IMPACT</b> · {result.changes.newlyAffectedAssets.length ? `It could newly affect ${result.changes.newlyAffectedAssets.join(", ")}. ` : "No additional infrastructure would be affected. "}{result.changes.newlyRequiredDepartments.length ? `It could require support from ${result.changes.newlyRequiredDepartments.join(", ")}. ` : "No additional departments would be required. "}{routeChange(result)}</span>
      <span><b>RESULT</b> · {resultLabel(result)}. {resultReason(result)} Simulated overall impact risk would be {result.simulated.cascade.cascadeRiskScore} / 100 ({result.simulated.cascade.cascadeRiskLevel}), with response priority {result.simulated.response.priority} and route {routeStatus(result.simulated)} ({routeEta(result.simulated)}).</span>
      <span><b>WHY IT MATTERS</b> · Use this result to judge whether the proposed action protects essential services and emergency access before approving it. This is a simulation only; the current incident remains unchanged.</span>
      <button className="button button-secondary" onClick={() => setResult(null)}>Return to baseline</button>
    </div>}
  </Panel>;
}