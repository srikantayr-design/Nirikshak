import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  incidents,
  infrastructureAssets,
  monitoredLocations,
  responseProfiles,
  historicalIncidents,
  type Asset,
  type Incident,
  type MonitoredLocation,
  type RouteOption,
  type Severity,
} from "./data/incidents";
import DigitalTwinMap from "./components/DigitalTwinMap";
import CommandCenterMap from "./components/CommandCenterMap";
import EmergencyRouting from "./components/EmergencyRouting";
import { MAP_CONFIG } from "./config";
import {
  fetchDrivingRoutes,
  obstacles,
  scoreRoute,
  type RouteCandidate,
} from "./data/routing";
import {
  loadPreferences,
  savePreferences,
  type Preferences,
} from "./preferences";
import {
  getIncidentByExternalId,
  getIncidents,
} from "./services/incidentService";
import {
  getInfrastructureAssets,
  infrastructureAssetToFrontendAsset,
} from "./services/infrastructureService";
import { getIncidentImpactDetails, type IncidentImpactDetail } from "./services/impactService";
import "./App.css";
import "./IncidentEnhancements.css";

type View =
  | "command"
  | "incidents"
  | "impact"
  | "cascade"
  | "infrastructure"
  | "analysis"
  | "routing"
  | "departments"
  | "simulator"
  | "history"
  | "settings";

type DepartmentId =
  | "fire"
  | "traffic"
  | "police"
  | "medical"
  | "electricity"
  | "water"
  | "infrastructure";

type RequestStatus =
  | "PENDING"
  | "ACTION REQUIRED"
  | "IN PROGRESS"
  | "COMPLETED";

type CoordinationRequest = {
  id: string;
  from: string;
  to: string;
  incidentId: string;
  incidentTitle: string;
  priority: string;
  help: string;
  status: RequestStatus;
  currentAction: string;
  createdAt: string;
};

const COORDINATION_REQUESTS_STORAGE_KEY =
  "nirikshak-coordination-requests";
const COORDINATION_REQUESTS_EVENT =
  "nirikshak-coordination-requests-change";

function readCoordinationRequests(): CoordinationRequest[] {
  try {
    const stored = window.localStorage.getItem(
      COORDINATION_REQUESTS_STORAGE_KEY
    );

    if (!stored) return [];

    const parsed = JSON.parse(stored) as CoordinationRequest[];

    if (!Array.isArray(parsed)) return [];

    return Array.from(
      new Map(
        parsed
          .filter(
            (request) =>
              request && typeof request.id === "string"
          )
          .map((request) => [request.id, request])
      ).values()
    );
  } catch {
    return [];
  }
}

function persistCoordinationRequests(
  requests: CoordinationRequest[]
) {
  window.localStorage.setItem(
    COORDINATION_REQUESTS_STORAGE_KEY,
    JSON.stringify(requests)
  );

  window.dispatchEvent(
    new CustomEvent(COORDINATION_REQUESTS_EVENT)
  );
}

const commandAssets = infrastructureAssets;

function enrichIncidentAssets(incident: Incident, assets: Asset[]): Incident {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    ...incident,
    assets: incident.assets.map((asset) => assetById.get(asset.id) ?? asset),
  };
}

const navGroups = [
  {
    label: "OPERATIONS",
    items: [
      ["command", "Command center", "⌂"],
      ["incidents", "Incidents", "!"],
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      ["infrastructure", "Digital twin", "◇"],
      ["analysis", "Analysis report", "▧"],
    ],
  },
  {
    label: "COORDINATION",
    items: [
      ["departments", "Departments", "▦"],
      ["simulator", "Scenario simulator", "△"],
    ],
  },
  {
    label: "RECORDS",
    items: [
      ["history", "Incident history", "▤"],
      ["settings", "Settings", "⚙"],
    ],
  },
] as const;

function App() {
  const [view, setView] = useState<View>("command");
  const [selectedIncident, setSelectedIncident] = useState(incidents[0]);
  const [databaseIncidents, setDatabaseIncidents] = useState<Incident[]>([]);
  const [incidentLoading, setIncidentLoading] = useState(true);
  const [incidentError, setIncidentError] = useState(false);
  const [databaseAssets, setDatabaseAssets] = useState<Asset[]>([]);
  const [infrastructureLoading, setInfrastructureLoading] = useState(true);
  const [infrastructureError, setInfrastructureError] = useState(false);
  const [selectedAsset, setSelectedAsset] =
    useState<Asset | null>(null);
  const [selectedLocation, setSelectedLocation] =
    useState<MonitoredLocation | null>(null);
  const [responseStatuses, setResponseStatuses] = useState<
    Record<string, string>
  >({});
  const [selectedDepartment, setSelectedDepartment] =
    useState<DepartmentId | null>(null);

  const [coordinationRequests, setCoordinationRequests] =
    useState<CoordinationRequest[]>(
      readCoordinationRequests
    );

  const [mobileNav, setMobileNav] = useState(false);
  const [preferences, setPreferences] =
    useState<Preferences>(loadPreferences);

  useEffect(() => {
    let active = true;

    void getIncidents()
      .then((loadedIncidents) => {
        if (!active) return;
        setDatabaseIncidents(loadedIncidents);
        if (loadedIncidents[0]) setSelectedIncident(loadedIncidents[0]);
      })
      .catch(() => {
        if (active) setIncidentError(true);
      })
      .finally(() => {
        if (active) setIncidentLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void getInfrastructureAssets()
      .then((records) => {
        if (!active) return;
        const assets = records.map(infrastructureAssetToFrontendAsset);
        setDatabaseAssets(assets);
        setDatabaseIncidents((current) => current.map((incident) => enrichIncidentAssets(incident, assets)));
        setSelectedIncident((current) => enrichIncidentAssets(current, assets));
      })
      .catch(() => {
        if (active) setInfrastructureError(true);
      })
      .finally(() => {
        if (active) setInfrastructureLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectDatabaseIncident = (incident: Incident) => {
    setSelectedIncident(enrichIncidentAssets(incident, databaseAssets));
  };

  useEffect(() => {
    const sync = (event: Event) =>
      setPreferences(
        (event as CustomEvent<Preferences>).detail
      );

    window.addEventListener(
      "nirikshak-preferences-change",
      sync
    );

    return () =>
      window.removeEventListener(
        "nirikshak-preferences-change",
        sync
      );
  }, []);

  useEffect(() => {
    const syncCoordinationRequests = () => {
      setCoordinationRequests(
        readCoordinationRequests()
      );
    };

    const syncFromStorage = (event: StorageEvent) => {
      if (
        event.key !==
        COORDINATION_REQUESTS_STORAGE_KEY
      )
        return;

      syncCoordinationRequests();
    };

    window.addEventListener(
      "storage",
      syncFromStorage
    );

    window.addEventListener(
      COORDINATION_REQUESTS_EVENT,
      syncCoordinationRequests
    );

    return () => {
      window.removeEventListener(
        "storage",
        syncFromStorage
      );

      window.removeEventListener(
        COORDINATION_REQUESTS_EVENT,
        syncCoordinationRequests
      );
    };
  }, []);

  useEffect(() => {
    if (
      !preferences.soundAlerts ||
      selectedIncident.severity !== "CRITICAL"
    )
      return;

    const AudioContextClass =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = 880;

    gain.gain.setValueAtTime(
      0.04,
      context.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + 0.16
    );

    oscillator.connect(gain).connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);

    void context.close();
  }, [
    preferences.soundAlerts,
    selectedIncident.id,
    selectedIncident.severity,
  ]);

  const navigate = (next: View) => {
    setView(next);
    setMobileNav(false);

    if (next === "departments") {
      setSelectedDepartment(null);
    }
  };

  const createCoordinationRequest = (
    request: CoordinationRequest
  ) =>
    setCoordinationRequests((current) => {
      const next = [
        request,
        ...current.filter(
          (existing) => existing.id !== request.id
        ),
      ];

      persistCoordinationRequests(next);

      return next;
    });

  const updateCoordinationRequest = (
    id: string,
    updates: Partial<CoordinationRequest>
  ) =>
    setCoordinationRequests((current) => {
      const next = current.map((request) =>
        request.id === id
          ? { ...request, ...updates }
          : request
      );

      persistCoordinationRequests(next);

      return next;
    });

  return (
    <main
      className={`app-shell ${
        preferences.compactDataDensity
          ? "compact-density"
          : ""
      }`}
    >
      <header className="topbar">
        <button
          className="mobile-menu"
          onClick={() => setMobileNav(!mobileNav)}
          aria-label="Toggle navigation"
        >
          ☰
        </button>

        <div className="brand">
          <span className="brand-mark">+</span>

          <span>
            <strong>NIRIKSHAK</strong>

            <small>
              NATIONAL RESPONSE INTELLIGENCE &amp; RISK
              KNOWLEDGE HUB
            </small>
          </span>
        </div>

        <Clock />

        <span className="avatar">S</span>
      </header>

      <aside
        className={`sidebar ${
          mobileNav ? "sidebar-open" : ""
        }`}
      >
        <div className="mission-label">
          NATIONAL OPERATIONS
          <br />
          <b>{MAP_CONFIG.region.toUpperCase()}</b>
        </div>

        <nav>
          {navGroups.map((group) => (
            <div
              className="nav-group"
              key={group.label}
            >
              <div className="nav-label">
                {group.label}
              </div>

              {group.items.map(
                ([id, label, icon]) => (
                  <button
                    key={id}
                    className={`nav-item ${
                      view === id ? "active" : ""
                    }`}
                    onClick={() =>
                      navigate(id)
                    }
                  >
                    <span className="nav-icon">
                      {icon}
                    </span>

                    {label}

                    {id === "incidents" &&
                      preferences.liveIncidentNotifications && (
                        <span className="nav-count">
                          04
                        </span>
                      )}
                  </button>
                )
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="shield">◇</span>

          <span>
            <b>SECURE NETWORK</b>
            <small>
              Encrypted session · v2.4.1
            </small>
          </span>
        </div>
      </aside>

      <section className="content-area">
        <PageHeader
          view={view}
          onNavigate={navigate}
        />

        <div className="page-content">
          {view === "command" && (
            <CommandCenter
              onNavigate={navigate}
              onIncident={selectDatabaseIncident}
              onAsset={setSelectedAsset}
              incidents={databaseIncidents}
              assets={databaseAssets}
              infrastructureLoading={infrastructureLoading}
              infrastructureError={infrastructureError}
            />
          )}

          {view === "incidents" && (
            <Incidents
              onNavigate={navigate}
              onIncident={selectDatabaseIncident}
              selectedIncident={selectedIncident}
              incidents={databaseIncidents}
              loading={incidentLoading}
              error={incidentError}
            />
          )}

          {view === "impact" && (
            <ImpactDashboard
              incident={selectedIncident}
              assets={databaseAssets}
              onBack={() => navigate("incidents")}
            />
          )}

          {view === "cascade" && (
            <CascadingEffects
              incident={selectedIncident}
              onIncident={setSelectedIncident}
              onBack={() => navigate("incidents")}
            />
          )}

          {view === "infrastructure" && (
            <Infrastructure
              selectedAsset={selectedAsset}
              onAsset={setSelectedAsset}
              selectedLocation={selectedLocation}
              onLocation={setSelectedLocation}
              assets={databaseAssets}
              loading={infrastructureLoading}
              error={infrastructureError}
              onAnalysis={() =>
                navigate("analysis")
              }
            />
          )}

          {view === "analysis" && (
            <AnalysisReport
              selectedLocation={selectedLocation}
              onLocation={setSelectedLocation}
              assets={databaseAssets}
              loading={infrastructureLoading}
              error={infrastructureError}
            />
          )}

          {view === "routing" && (
            <EmergencyRouting
              incident={selectedIncident}
              onBack={() =>
                navigate("incidents")
              }
              responseStatus={
                responseStatuses[selectedIncident.id]
              }
              onDispatch={() =>
                setResponseStatuses(
                  (current) => ({
                    ...current,
                    [selectedIncident.id]:
                      "Dispatched",
                  })
                )
              }
              SeverityTag={SeverityTag}
              StatusTag={StatusTag}
              Panel={Panel}
            />
          )}

          {view === "departments" &&
            (selectedDepartment ? (
              <DepartmentDashboard
                departmentId={
                  selectedDepartment
                }
                onBack={() =>
                  setSelectedDepartment(null)
                }
                requests={
                  coordinationRequests
                }
                onRequest={
                  createCoordinationRequest
                }
                onUpdateRequest={
                  updateCoordinationRequest
                }
              />
            ) : (
              <Departments
                onSelect={
                  setSelectedDepartment
                }
              />
            ))}

          {view === "simulator" && (
            <Simulator />
          )}

          {view === "history" && (
            <History />
          )}

          {view === "settings" && (
            <SettingsPage />
          )}
        </div>
      </section>
    </main>
  );
}

function PageHeader({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  const titles: Record<
    View,
    [string, string]
  > = {
    command: [
      "Command center",
      "Live operational overview",
    ],
    incidents: [
      "Incidents",
      "Monitor, triage and coordinate active events",
    ],
    impact: [
      "Infrastructure impact",
      "Assess current and predicted effects of the selected incident",
    ],
    cascade: [
      "Cascading impact",
      "Trace how the selected incident propagates across dependencies",
    ],
    infrastructure: [
      "Infrastructure / digital twin",
      "Inspect monitored assets and risk zones",
    ],
    analysis: [
      "Analysis report",
      "Preventive infrastructure risk assessment and what-if analysis",
    ],
    routing: [
      "Response & routing",
      "Coordinate the fastest safe response",
    ],
    departments: [
      "Departments",
      "Cross-agency coordination status",
    ],
    simulator: [
      "Scenario simulator",
      "Compare intervention strategies before deployment",
    ],
    history: [
      "Incident history",
      "Search and review resolved operations",
    ],
    settings: [
      "Settings",
      "Control room preferences and system configuration",
    ],
  };

  return (
    <div className="page-header">
      <div>
        <div className="breadcrumb">
          OPERATIONS / {view.toUpperCase()}
        </div>

        <h1>{titles[view][0]}</h1>

        <p>{titles[view][1]}</p>
      </div>

      <div className="header-actions">
        {view === "command" && (
          <button
            className="button button-primary"
            onClick={() =>
              onNavigate("incidents")
            }
          >
            + Log incident
          </button>
        )}
      </div>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(
    () => new Date()
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(new Date()),
      1000
    );

    return () =>
      window.clearInterval(timer);
  }, []);

  const value = new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone: MAP_CONFIG.timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }
  ).format(now);

  return (
    <div className="top-status">
      <span className="live-dot" />

      SYSTEMS OPERATIONAL

      <span className="status-divider" />

      <span className="clock">
        {value} IST
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
  icon: string;
}) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-top">
        <span>{label}</span>
        <b className="stat-icon">
          {icon}
        </b>
      </div>

      <strong>{value}</strong>

      <small>{detail}</small>
    </div>
  );
}

function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`panel ${className}`}
    >
      <div className="panel-header">
        <div>
          {eyebrow && (
            <span className="eyebrow">
              {eyebrow}
            </span>
          )}

          <h2>{title}</h2>
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function SeverityTag({
  severity,
}: {
  severity: Severity;
}) {
  return (
    <span
      className={`severity severity-${severity.toLowerCase()}`}
    >
      <i />
      {severity}
    </span>
  );
}

function StatusTag({
  status,
}: {
  status: string;
}) {
  return (
    <span
      className={`status-tag status-${status.toLowerCase()}`}
    >
      {status}
    </span>
  );
}

function OperationalMap({
  selectedAsset,
  onAsset,
  compact = false,
}: {
  selectedAsset?: Asset | null;
  onAsset?: (asset: Asset) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`operational-map ${
        compact ? "map-compact" : ""
      }`}
    >
      <div className="map-toolbar">
        <button className="map-tool active">
          ⌖
        </button>

        <button className="map-tool">
          +
        </button>

        <button className="map-tool">
          −
        </button>
      </div>

      <div className="map-grid" />

      <div className="map-road road-a" />
      <div className="map-road road-b" />
      <div className="map-road road-c" />
      <div className="map-road road-d" />

      {commandAssets.map((asset) => (
        <button
          key={asset.id}
          className={`map-marker marker-${asset.status
            .toLowerCase()
            .replace(" ", "-")} ${
            selectedAsset?.id === asset.id
              ? "marker-selected"
              : ""
          }`}
          style={{
            left: `${asset.x}%`,
            top: `${asset.y}%`,
          }}
          onClick={() =>
            onAsset?.(asset)
          }
          title={asset.name}
        >
          {asset.type === "BUILDING"
            ? "▰"
            : asset.type === "HOSPITAL"
            ? "+"
            : asset.type === "ROAD"
            ? "×"
            : "◆"}
        </button>
      ))}

      <div
        className="incident-pulse"
        style={{
          left: "53%",
          top: "40%",
        }}
      />

      <div className="map-label label-incident">
        INC-2407 <b>CRITICAL</b>
      </div>

      <div className="map-scale">
        500 m
      </div>

      <div className="map-attribution">
        OPERATIONAL MAP · BENGALURU URBAN
      </div>
    </div>
  );
}

function CommandCenter({
  onNavigate,
  onIncident,
  onAsset,
  incidents: databaseIncidents,
  assets,
  infrastructureLoading,
  infrastructureError,
}: {
  onNavigate: (view: View) => void;
  onIncident: (incident: Incident) => void;
  onAsset: (asset: Asset) => void;
  incidents: Incident[];
  assets: Asset[];
  infrastructureLoading: boolean;
  infrastructureError: boolean;
}) {
  const activeIncident =
    databaseIncidents.find(
      (incident) =>
        incident.severity === "CRITICAL" &&
        incident.status === "ACTIVE"
    ) ?? databaseIncidents[0];

  const affectedAssetCount = activeIncident
    ? new Set(activeIncident.affectedInfrastructure).size
    : 0;

  return (
    <>
      <div className="stats-grid">
        <StatCard
          label="Active incidents"
          value={databaseIncidents.length.toString().padStart(2, "0")}
          detail="+1 in last 30 min"
          tone="red"
          icon="!"
        />

        <StatCard
          label="Critical incidents"
          value={databaseIncidents.filter((incident) => incident.severity === "CRITICAL").length.toString().padStart(2, "0")}
          detail="Requires immediate action"
          tone="orange"
          icon="◆"
        />

        <StatCard
          label="Assets at risk"
          value={affectedAssetCount.toString().padStart(2, "0")}
          detail="Across 4 infrastructure types"
          tone="yellow"
          icon="◇"
        />

        <StatCard
          label="Departments responding"
          value="07"
          detail="All primary agencies online"
          tone="blue"
          icon="▦"
        />
      </div>

      <div className="command-grid">
        <Panel
          title="Operational map"
          eyebrow="LIVE SITUATIONAL AWARENESS"
          className="map-panel"
          action={
            <button
              className="text-button"
              onClick={() =>
                onNavigate(
                  "infrastructure"
                )
              }
            >
              Open digital twin ↗
            </button>
          }
        >
          {infrastructureLoading && <p className="muted-copy">Loading infrastructure...</p>}
          {infrastructureError && <p className="muted-copy">Unable to load infrastructure data.</p>}
          {!infrastructureLoading && !infrastructureError && !activeIncident && <p className="muted-copy">No infrastructure data available.</p>}
          {!infrastructureLoading && !infrastructureError && activeIncident && <CommandCenterMap incident={activeIncident} assets={assets} onAsset={onAsset} />}
        </Panel>

        <div className="command-side">
          <Panel
            title="Active incidents"
            eyebrow="04 EVENTS"
            action={
              <button
                className="text-button"
                onClick={() =>
                  onNavigate("incidents")
                }
              >
                View all
              </button>
            }
          >
            <div className="incident-list">
              {databaseIncidents
                .slice(0, 3)
                .map((incident) => (
                  <button
                    className="incident-row"
                    key={incident.id}
                    onClick={() => {
                      onIncident(
                        incident
                      );
                      onNavigate(
                        "incidents"
                      );
                    }}
                  >
                    <span
                      className={`incident-indicator ${incident.severity.toLowerCase()}`}
                    />

                    <span className="incident-row-copy">
                      <b>
                        {incident.title}
                      </b>

                      <small>
                        {incident.location} ·{" "}
                        {incident.time}
                      </small>
                    </span>

                    <SeverityTag
                      severity={
                        incident.severity
                      }
                    />
                  </button>
                ))}
            </div>
          </Panel>

          <Panel
            title="Recommended actions"
            eyebrow="DECISION SUPPORT"
          >
            <div className="action-list">
              <Action
                text="Establish 200m exclusion zone around Building A"
                meta="Fire command · immediate"
              />

              <Action
                text="Reroute northbound traffic from Road R12"
                meta="Traffic control · in progress"
              />

              <Action
                text="Isolate Transformer T4 before thermal escalation"
                meta="Electricity · recommended"
              />
            </div>
          </Panel>
        </div>
      </div>

      <div className="bottom-grid">
        <StatCard
          label="Active emergency units"
          value="18"
          detail="6 fire · 5 police · 7 medical"
          tone="green"
          icon="⊙"
        />

        <Panel
          title="Response readiness"
          eyebrow="NETWORK STATUS"
          className="readiness-panel"
        >
          <div className="readiness-row">
            <span>Fire services</span>
            <b>6 / 6 units available</b>

            <div className="progress">
              <i
                style={{
                  width: "100%",
                }}
              />
            </div>
          </div>

          <div className="readiness-row">
            <span>Medical response</span>
            <b>7 / 9 units available</b>

            <div className="progress">
              <i
                style={{
                  width: "77%",
                }}
              />
            </div>
          </div>

          <div className="readiness-row">
            <span>Traffic control</span>
            <b>5 / 5 units available</b>

            <div className="progress">
              <i
                style={{
                  width: "100%",
                }}
              />
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function Action({
  text,
  meta,
}: {
  text: string;
  meta: string;
}) {
  return (
    <div className="action-item">
      <span className="action-check">
        ✓
      </span>

      <div>
        <b>{text}</b>
        <small>{meta}</small>
      </div>

      <button className="more-button">
        •••
      </button>
    </div>
  );
}

function Incidents({
  onNavigate,
  onIncident,
  selectedIncident,
  incidents: databaseIncidents,
  loading,
  error,
}: {
  onNavigate: (view: View) => void;
  onIncident: (incident: Incident) => void;
  selectedIncident: Incident;
  incidents: Incident[];
  loading: boolean;
  error: boolean;
}) {
  const [filter, setFilter] =
    useState("ALL");

  const [drawerOpen, setDrawerOpen] =
    useState(false);
  const [profileLoading, setProfileLoading] =
    useState(false);
  const [profileError, setProfileError] =
    useState(false);

  const shown =
    filter === "ALL"
      ? databaseIncidents
      : databaseIncidents.filter(
          (item) =>
            item.severity === filter
        );

  const selectIncident = async (incident: Incident) => {
    setProfileLoading(true);
    setProfileError(false);
    setDrawerOpen(true);

    try {
      const selected = await getIncidentByExternalId(incident.id);
      onIncident(selected);
    } catch {
      setProfileError(true);
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <div className="incidents-shell">
      <Panel
        title="Incident register"
        eyebrow="LIVE REGISTER"
        action={
          <div className="filter-tabs">
            {[
              "ALL",
              "CRITICAL",
              "HIGH",
              "MEDIUM",
            ].map((item) => (
              <button
                className={
                  filter === item
                    ? "selected"
                    : ""
                }
                onClick={() =>
                  setFilter(item)
                }
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
        }
      >
        {loading && (
          <p className="muted-copy">Loading incidents...</p>
        )}

        {error && (
          <p className="muted-copy">Unable to load incidents.</p>
        )}

        {!loading && !error && !shown.length && (
          <p className="muted-copy">No incidents found.</p>
        )}

        {!loading && !error && shown.length > 0 && <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Incident</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Location</th>
                <th>Confidence</th>
                <th>Updated</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {shown.map(
                (incident) => (
                  <tr
                    className={
                      selectedIncident.id ===
                      incident.id
                        ? "row-selected"
                        : ""
                    }
                    key={incident.id}
                    onClick={() =>
                      selectIncident(
                        incident
                      )
                    }
                  >
                    <td>
                      <b>
                        {incident.title}
                      </b>
                      <small>
                        {incident.id}
                      </small>
                    </td>

                    <td>
                      {incident.type}
                    </td>

                    <td>
                      <SeverityTag
                        severity={
                          incident.severity
                        }
                      />
                    </td>

                    <td>
                      {incident.location}
                    </td>

                    <td>
                      <span className="confidence">
                        {incident.confidence}%
                      </span>
                    </td>

                    <td>
                      {incident.time}
                    </td>

                    <td>
                      <StatusTag
                        status={
                          incident.status
                        }
                      />
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>}
      </Panel>

      {drawerOpen && (
        <IncidentDrawer
          incident={selectedIncident}
          loading={profileLoading}
          error={profileError}
          onClose={() =>
            setDrawerOpen(false)
          }
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

function IncidentDrawer({
  incident,
  loading,
  error,
  onClose,
  onNavigate,
}: {
  incident: Incident;
  loading: boolean;
  error: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
}) {
  if (loading || error) {
    return (
      <aside className="incident-drawer" aria-label="Incident details">
        <div className="drawer-header">
          <div>
            <span className="eyebrow">{incident.id} · INCIDENT PROFILE</span>
            <h2>{incident.title}</h2>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close incident details">
            ×
          </button>
        </div>
        <p className="muted-copy">{loading ? "Loading incidents..." : "Unable to load incidents."}</p>
      </aside>
    );
  }

  return (
    <aside
      className="incident-drawer"
      aria-label="Incident details"
    >
      <div className="drawer-header">
        <div>
          <span className="eyebrow">
            {incident.id} · INCIDENT PROFILE
          </span>

          <h2>{incident.title}</h2>
        </div>

        <button
          className="drawer-close"
          onClick={onClose}
          aria-label="Close incident details"
        >
          ×
        </button>
      </div>

      <div className="drawer-status">
        <SeverityTag
          severity={incident.severity}
        />

        <StatusTag
          status={incident.status}
        />

        <span>
          {incident.confidence}%
          confidence
        </span>
      </div>

      <p className="drawer-location">
        {incident.type} ·{" "}
        {incident.location} · Detected{" "}
        {incident.detectionTime}
      </p>

      <div className="drawer-scroll">
        <Panel
          title="Event profile"
          eyebrow="SINGLE SOURCE OF TRUTH"
        >
          <InfoRows
            rows={[
              [
                "Incident type",
                incident.type,
              ],
              [
                "Title",
                incident.title,
              ],
              [
                "Location",
                incident.location,
              ],
              [
                "Severity",
                incident.severity,
              ],
              [
                "Confidence",
                `${incident.confidence}%`,
              ],
              [
                "Status",
                incident.status,
              ],
              [
                "Detection time",
                incident.detectionTime,
              ],
            ]}
          />
        </Panel>

        <div className="drawer-actions">
          <button
            className="button button-secondary"
            onClick={() => onNavigate("impact")}
          >
            View impact
          </button>

          <button
            className="button button-secondary"
            onClick={() => onNavigate("cascade")}
          >
            View cascading impact
          </button>

          <button
            className="button button-primary"
            onClick={() =>
              onNavigate("routing")
            }
          >
            Response &amp; Routing ↗
          </button>
        </div>

        <Panel
          title="Infrastructure"
          eyebrow="AFFECTED ASSETS"
        >
          <div className="drawer-list">
            {incident.affectedInfrastructure.map(
              (item) => (
                <span key={item}>
                  {item}
                </span>
              )
            )}
          </div>
        </Panel>

        <Panel
          title="Impact register"
          eyebrow="DATABASE IMPACTS"
        >
          <div className="drawer-list">
            {(incident.impactDetails ?? []).map((impact) => (
              <span key={`${impact.assetName}-${impact.impactState}`}>
                {impact.assetName} · {impact.impactState} · {impact.impactType}
                {impact.likelihood === null ? "" : ` · ${impact.likelihood}% likelihood`}
              </span>
            ))}
          </div>
        </Panel>

        <Panel
          title="Current impacts"
          eyebrow="OBSERVED NOW"
        >
          <p className="muted-copy">
            {incident.currentImpacts}
          </p>
        </Panel>

        <Panel
          title="Predicted impacts"
          eyebrow="NEXT WINDOW"
        >
          <p className="muted-copy">
            {incident.predictedImpacts}
          </p>
        </Panel>

        <Panel
          title="Cascading effects"
          eyebrow="DEPENDENCY ANALYSIS"
        >
          <p className="muted-copy">
            {incident.cascadeSummary}
          </p>

          <div className="effect-chain">
            <span>
              {incident.cascade.primaryEvent}
            </span>

            <b>→</b>

            <span>
              {
                incident.cascade
                  .branches[0].nodes[1]
                  .name
              }
            </span>

            <b>→</b>

            <span>
              {
                incident.cascade
                  .branches[0].nodes.at(
                    -1
                  )?.name
              }
            </span>
          </div>
        </Panel>

        <Panel
          title="Recommended actions"
          eyebrow="ACTION PLAN"
        >
          <div className="response-plan">
            {incident.recommendedActions.map(
              (action) => (
                <Action
                  key={action.text}
                  text={action.text}
                  meta={action.meta}
                />
              )
            )}
          </div>
        </Panel>

        <Panel
          title="Responsible departments"
          eyebrow="COORDINATION"
        >
          <div className="drawer-list">
            {incident.responsibleDepartments.map(
              (department) => (
                <span key={department}>
                  {department}
                </span>
              )
            )}
          </div>
        </Panel>
      </div>
    </aside>
  );
}

function InfoRows({
  rows,
}: {
  rows: string[][];
}) {
  return (
    <div className="info-rows">
      {rows.map(
        ([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        )
      )}
    </div>
  );
}

function Infrastructure({
  selectedAsset,
  onAsset,
  selectedLocation,
  onLocation,
  onAnalysis,
  assets,
  loading,
  error,
}: {
  selectedAsset: Asset | null;
  onAsset: (
    asset: Asset | null
  ) => void;
  selectedLocation:
    | MonitoredLocation
    | null;
  onLocation: (
    location: MonitoredLocation
  ) => void;
  onAnalysis: () => void;
  assets: Asset[];
  loading: boolean;
  error: boolean;
}) {
  const [layers, setLayers] =
    useState<Record<string, boolean>>({
      roads: true,
      buildings: true,
      hospitals: true,
      fire: true,
      police: true,
      electricity: true,
      water: true,
      emergency: true,
      locations: true,
    });

  const layerOptions = [
    ["roads", "Roads"],
    ["buildings", "Buildings"],
    ["hospitals", "Hospitals"],
    ["fire", "Fire"],
    ["police", "Police"],
    ["electricity", "Electricity"],
    ["water", "Water"],
    ["emergency", "Emergency Centres"],
    [
      "locations",
      "Monitoring / Risk Zones",
    ],
  ] as const;

  return (
    <div className="twin-layout">
      <Panel
        title="Urban infrastructure map"
        eyebrow="DIGITAL TWIN · OPENSTREETMAP"
        className="twin-map-panel"
      >
        {loading && <p className="muted-copy">Loading infrastructure...</p>}
        {error && <p className="muted-copy">Unable to load infrastructure data.</p>}
        {!loading && !error && !assets.length && <p className="muted-copy">No infrastructure data available.</p>}
        {!loading && !error && assets.length > 0 && <DigitalTwinMap
          assets={assets}
          locations={monitoredLocations}
          layers={layers}
          selectedAsset={selectedAsset}
          selectedLocation={selectedLocation}
          onAsset={onAsset}
          onLocation={onLocation}
        />}

        <div className="layer-strip">
          {layerOptions.map(
            ([id, label]) => (
              <button
                className={
                  layers[id]
                    ? "layer-on"
                    : ""
                }
                onClick={() =>
                  setLayers({
                    ...layers,
                    [id]: !layers[id],
                  })
                }
                key={id}
              >
                <i />
                {label}
              </button>
            )
          )}
        </div>

        <div className="map-legend map-legend-geographic">
          <span>
            <i className="legend-dot critical" />
            High-risk zone
          </span>

          <span>
            <i className="legend-dot asset" />
            Infrastructure asset
          </span>

          <span>
            <i className="legend-line" />
            Road network
          </span>
        </div>
      </Panel>

      <Panel
        title="Asset inspector"
        eyebrow={
          selectedAsset
            ? selectedAsset.id
            : selectedLocation
            ? selectedLocation.id
            : "SELECT AN ASSET OR ZONE"
        }
        className="inspector-panel"
      >
        {selectedAsset ? (
          <AssetInspector
            asset={selectedAsset}
            onClear={() =>
              onAsset(null)
            }
          />
        ) : selectedLocation ? (
          <LocationInspector
            location={
              selectedLocation
            }
            onAnalysis={onAnalysis}
          />
        ) : (
          <div className="empty-inspector">
            <span>◇</span>
            <b>
              Select an asset or monitored
              zone
            </b>

            <p>
              Inspect live status,
              ownership and connected
              dependencies.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AssetInspector({
  asset,
  onClear,
}: {
  asset: Asset;
  onClear: () => void;
}) {
  return (
    <>
      <div className="inspector-title">
        <span className="asset-large">
          ◆
        </span>

        <div>
          <h2>{asset.name}</h2>
          <p>{asset.type}</p>
        </div>

        <StatusTag
          status={asset.status}
        />
      </div>

      <InfoRows
        rows={[
          [
            "Asset name",
            asset.name,
          ],
          [
            "Asset type",
            asset.type,
          ],
          [
            "Current status",
            asset.status,
          ],
          [
            "Criticality",
            asset.criticality ??
              "MEDIUM",
          ],
          [
            "Current risk",
            `${asset.currentRisk ?? 0}%`,
          ],
          [
            "Connected infrastructure",
            asset.connectedAssets?.join(
              ", "
            ) ?? "None",
          ],
        ]}
      />

      <div className="inspector-note">
        <b>
          Potential consequence if
          unavailable
        </b>

        <p>
          {asset.potentialConsequence ??
            asset.detail}
        </p>
      </div>

      <button
        className="button button-secondary full-button"
        onClick={onClear}
      >
        Clear selection
      </button>
    </>
  );
}

function LocationInspector({
  location,
  onAnalysis,
}: {
  location: MonitoredLocation;
  onAnalysis: () => void;
}) {
  return (
    <>
      <div className="inspector-title">
        <span className="asset-large">
          ◎
        </span>

        <div>
          <h2>{location.name}</h2>
          <p>{location.type}</p>
        </div>

        <SeverityTag
          severity={location.risk}
        />
      </div>

      <InfoRows
        rows={[
          [
            "Risk score",
            `${location.riskScore}%`,
          ],
          [
            "Infrastructure density",
            location.density,
          ],
          [
            "Last analyzed",
            location.lastAnalyzed,
          ],
          [
            "Nearby critical assets",
            `${location.nearbyAssetIds.length}`,
          ],
        ]}
      />

      <div className="inspector-note">
        <b>Current vulnerability</b>

        <p>
          {location.vulnerability[0]}.{" "}
          {location.vulnerability[1]}.
        </p>
      </div>

      <button
        className="button button-primary full-button"
        onClick={onAnalysis}
      >
        Open analysis report ↗
      </button>
    </>
  );
}

function AnalysisReport({
  selectedLocation,
  onLocation,
  assets,
  loading,
  error,
}: {
  selectedLocation:
    | MonitoredLocation
    | null;
  onLocation: (
    location: MonitoredLocation
  ) => void;
  assets: Asset[];
  loading: boolean;
  error: boolean;
}) {
  const [scenarioType, setScenarioType] =
    useState("FIRE");

  const location =
    selectedLocation ??
    monitoredLocations[0];

  const scenario =
    location.scenarios[
      scenarioType
    ];

  const nearbyAssets =
    location.nearbyAssetIds
      .map((id) =>
        assets.find(
          (asset) => asset.id === id
        )
      )
      .filter(
        (asset): asset is Asset =>
          Boolean(asset)
      );

  return (
    <div className="analysis-layout">
      {loading && <p className="muted-copy">Loading infrastructure...</p>}
      {error && <p className="muted-copy">Unable to load infrastructure data.</p>}
      {!loading && !error && !assets.length && <p className="muted-copy">No infrastructure data available.</p>}
      <Panel
        title="Monitored locations"
        eyebrow="PREVENTIVE RISK REGISTER"
        className="location-list-panel"
      >
        <div className="analysis-location-list">
          {monitoredLocations.map(
            (item) => (
              <button
                className={`analysis-location ${
                  item.id === location.id
                    ? "selected"
                    : ""
                }`}
                onClick={() => {
                  onLocation(item);
                  setScenarioType(
                    "FIRE"
                  );
                }}
                key={item.id}
              >
                <span
                  className={`incident-indicator ${item.risk.toLowerCase()}`}
                />

                <span>
                  <b>{item.name}</b>
                  <small>
                    {item.type} ·{" "}
                    {item.lastAnalyzed}
                  </small>
                </span>

                <strong>
                  {item.riskScore}%
                  <small>
                    {item.risk}
                  </small>
                </strong>
              </button>
            )
          )}
        </div>
      </Panel>

      <div className="analysis-main">
        <div className="analysis-hero">
          <div>
            <span className="eyebrow">
              CURRENT OBSERVATION · MOCK
              RISK ASSESSMENT
            </span>

            <h2>{location.name}</h2>

            <p>
              {location.type} ·
              Infrastructure density:{" "}
              {location.density} · Last
              analyzed{" "}
              {location.lastAnalyzed}
            </p>
          </div>

          <div className="analysis-score">
            <b>{location.riskScore}%</b>
            <small>
              {location.risk} RISK
            </small>
          </div>
        </div>

        <Panel
          title="Location detail"
          eyebrow="VULNERABILITY PROFILE"
        >
          <div className="analysis-columns">
            <div>
              <h3>
                Primary vulnerabilities
              </h3>

              <ul>
                {location.vulnerability.map(
                  (item) => (
                    <li key={item}>
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>

            <div>
              <h3>
                Critical infrastructure
                nearby
              </h3>

              <ul>
                {nearbyAssets.map(
                  (asset) => (
                    <li key={asset.id}>
                      {asset.name}{" "}
                      <small>
                        {asset.type}
                      </small>
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>
        </Panel>

        <Panel
          title="Potential major incident"
          eyebrow="SIMULATED · POTENTIAL · WHAT-IF"
        >
          <div className="scenario-controls">
            <label>
              Hypothetical incident

              <select
                value={scenarioType}
                onChange={(event) =>
                  setScenarioType(
                    event.target.value
                  )
                }
              >
                {[
                  "FIRE",
                  "STRUCTURAL COLLAPSE",
                  "FLOOD",
                  "INDUSTRIAL ACCIDENT",
                  "ELECTRICAL FAILURE",
                ].map((type) => (
                  <option
                    key={type}
                    value={type}
                  >
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <span>
              Assumption confidence{" "}
              <b>
                {scenario.confidence}%
              </b>
            </span>

            <span>
              Estimated severity{" "}
              <SeverityTag
                severity={
                  scenario.severity
                }
              />
            </span>
          </div>

          <div className="analysis-flow">
            <FlowStep
              label="LOCATION"
              value={location.name}
            />

            <b>→</b>

            <FlowStep
              label="HYPOTHETICAL INCIDENT"
              value={scenario.primary}
            />

            <b>→</b>

            <FlowStep
              label="PRIMARY IMPACT"
              value={scenario.secondary[0]}
            />

            <b>→</b>

            <FlowStep
              label="SECONDARY IMPACT"
              value={scenario.tertiary[0]}
            />

            <b>→</b>

            <FlowStep
              label="DEPARTMENTS"
              value={`${scenario.departments.length} potentially affected`}
            />
          </div>

          <div className="impact-columns">
            <ImpactList
              title="PRIMARY IMPACT"
              items={[scenario.primary]}
            />

            <ImpactList
              title="SECONDARY IMPACTS"
              items={scenario.secondary}
            />

            <ImpactList
              title="TERTIARY IMPACTS"
              items={scenario.tertiary}
            />
          </div>
        </Panel>

        <div className="analysis-bottom">
          <Panel
            title="Departmental impact"
            eyebrow="POTENTIAL FUTURE SCENARIO"
          >
            <div className="department-impact-list">
              {scenario.departments.map(
                (department) => (
                  <div
                    key={department.name}
                  >
                    <b>
                      {department.name}
                    </b>

                    <span>
                      →{" "}
                      {department.action}
                    </span>
                  </div>
                )
              )}
            </div>
          </Panel>

          <Panel
            title="Preventive recommendations"
            eyebrow="RECOMMENDED ACTIONS"
          >
            <div className="recommendation-list">
              {scenario.recommendations.map(
                (recommendation) => (
                  <div
                    key={recommendation}
                  >
                    <span>✓</span>
                    {recommendation}
                  </div>
                )
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function FlowStep({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flow-step">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}

function ImpactList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="impact-list">
      <span>{title}</span>

      {items.map((item) => (
        <b key={item}>{item}</b>
      ))}
    </div>
  );
}

function ImpactDashboard({
  incident,
  assets,
  onBack,
}: {
  incident: Incident;
  assets: Asset[];
  onBack: () => void;
}) {
  const [impactDetails, setImpactDetails] = useState<IncidentImpactDetail[]>([]);
  const [impactLoading, setImpactLoading] = useState(true);
  const [impactError, setImpactError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!incident.databaseId) {
      setImpactLoading(false);
      setImpactError(true);
      return () => {
        active = false;
      };
    }

    setImpactLoading(true);
    setImpactError(false);
    void getIncidentImpactDetails(incident.databaseId)
      .then((details) => {
        if (active) setImpactDetails(details);
      })
      .catch(() => {
        if (active) setImpactError(true);
      })
      .finally(() => {
        if (active) setImpactLoading(false);
      });

    return () => {
      active = false;
    };
  }, [incident.databaseId]);

  const impactAssets = impactDetails
    .map((impact) => assets.find((asset) => asset.id === impact.asset?.external_id))
    .filter((asset): asset is Asset => Boolean(asset));
  const riskValue = (asset: Asset) =>
    asset.currentRisk ??
    incident.cascade.escalationProbability;
  const riskAsset = impactAssets.reduce(
    (highest, asset) => riskValue(asset) > riskValue(highest) ? asset : highest,
    impactAssets[0]
  );

  return (
    <div className="response-layout">
      <div className="detail-banner">
        <div>
          <button className="text-button" onClick={onBack}>← Back to incident</button>
          <span className="eyebrow">INFRASTRUCTURE IMPACT · {incident.id}</span>
          <h2>{incident.title}</h2>
          <p>{incident.type} · {incident.location} · {incident.status}</p>
        </div>
        <div className="response-heading-tags">
          <SeverityTag severity={incident.severity} />
          <StatusTag status={incident.status} />
        </div>
      </div>

      {impactLoading && <p className="muted-copy">Loading infrastructure...</p>}
      {impactError && <p className="muted-copy">Unable to load infrastructure data.</p>}
      {!impactLoading && !impactError && !impactDetails.length && <p className="muted-copy">No infrastructure data available.</p>}

      <div className="detail-grid">
        <Panel title="Current impact" eyebrow="OBSERVED NOW">
          <p className="muted-copy">{incident.currentImpacts}</p>
          <div className="mini-metrics">
            <div><b>{impactDetails.length}</b><small>AFFECTED IMPACTS</small></div>
            <div><b>{incident.confidence}%</b><small>MODEL CONFIDENCE</small></div>
            <div><b>{incident.severity}</b><small>SEVERITY</small></div>
          </div>
        </Panel>

        <Panel title="Predicted impact" eyebrow="NEXT WINDOW">
          <p className="muted-copy">{incident.predictedImpacts}</p>
          <div className="mini-metrics">
            <div><b>{incident.cascade.escalationProbability}%</b><small>ESCALATION RISK</small></div>
            <div><b>{riskAsset ? `${riskValue(riskAsset)}%` : "—"}</b><small>HIGHEST ASSET RISK</small></div>
            <div><b>{riskAsset?.name ?? "—"}</b><small>PRIORITY ASSET</small></div>
          </div>
        </Panel>

        <Panel title="Affected infrastructure" eyebrow="INCIDENT-SPECIFIC ASSETS">
          <div className="asset-rows">
            {impactDetails.map((impact) => {
              const asset = assets.find((item) => item.id === impact.asset?.external_id);
              if (!asset) return null;
              return <div className="asset-row" key={impact.id}>
                <span className="asset-large">◆</span>
                <span><b>{asset.name}</b><small>{asset.type} · {impact.impact_state} · {impact.impact_type} · Risk {riskValue(asset)}% · {impact.description ?? asset.detail}</small></span>
                <SeverityTag severity={impact.severity?.toUpperCase() as Severity ?? asset.criticality ?? "MEDIUM"} />
              </div>;
            })}
          </div>
        </Panel>

        <Panel title="Response impact" eyebrow="DEPARTMENTS AFFECTED">
          <div className="drawer-list">
            {incident.responsibleDepartments.map((department) => <span key={department}>{department}</span>)}
          </div>
          <p className="muted-copy">{incident.cascadeSummary}</p>
        </Panel>
      </div>
    </div>
  );
}

function CascadingEffects({
  incident,
  onIncident,
  onBack,
}: {
  incident: Incident;
  onIncident: (
    incident: Incident
  ) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] =
    useState(
      incident.cascade.branches[0]
        .nodes[0].name
    );

  const nodes =
    incident.cascade.branches.flatMap(
      (branch) => branch.nodes
    );

  const selectedNode =
    nodes.find(
      (item) =>
        item.name === selected
    ) ?? nodes[0];

  const branch = (
    items: typeof nodes,
    label: string
  ) => (
    <div className="cascade-branch">
      <span className="branch-label">
        {label}
      </span>

      {items.map(
        (node, index) => (
          <div
            className="cascade-step"
            key={`${label}-${node.name}`}
          >
            <button
              className={`cascade-node ${
                selected === node.name
                  ? "selected"
                  : ""
              }`}
              onClick={() =>
                setSelected(node.name)
              }
            >
              <small>
                {node.type}
              </small>

              <b>{node.name}</b>
            </button>

            {index <
              items.length - 1 && (
              <span className="cascade-arrow">
                →
              </span>
            )}
          </div>
        )
      )}
    </div>
  );

  return (
    <>
      <button className="text-button" onClick={onBack}>← Back to incident</button>
      <div className="cascade-toolbar">
        <label>
          Incident

          <select
            value={incident.id}
            onChange={(event) => {
              const next =
                incidents.find(
                  (item) =>
                    item.id ===
                    event.target.value
                );

              if (next) {
                onIncident(next);
                setSelected(
                  next.cascade.branches[0]
                    .nodes[0].name
                );
              }
            }}
          >
            {incidents.map(
              (item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.id} ·{" "}
                  {item.title}
                </option>
              )
            )}
          </select>
        </label>

        <div className="cascade-summary">
          <span>
            Escalation probability{" "}
            <b>
              {
                incident.cascade
                  .escalationProbability
              }
              %
            </b>
          </span>

          <span>
            Highest-risk asset{" "}
            <b>
              {
                incident.cascade
                  .highestRiskAsset
              }
            </b>
          </span>
        </div>
      </div>

      <div className="cascade-layout">
        <Panel
          title="Dependency propagation"
          eyebrow={`${incident.id} · LIVE MODEL`}
          className="cascade-panel"
        >
          {incident.cascade.branches.map(
            (item) =>
              branch(
                item.nodes,
                item.label
              )
          )}
        </Panel>

        <Panel
          title="Selected node"
          eyebrow="NODE INTELLIGENCE"
          className="node-panel"
        >
          <span className="eyebrow">
            {selectedNode.type}
          </span>

          <h2>{selectedNode.name}</h2>

          <p className="muted-copy">
            {selectedNode.detail}
          </p>

          <div className="node-facts">
            <div>
              <span>
                Propagation state
              </span>

              <b
                className={
                  selectedNode.risk >
                  60
                    ? "text-red"
                    : "text-orange"
                }
              >
                {selectedNode.risk >
                60
                  ? "ELEVATED"
                  : "MONITORING"}
              </b>
            </div>

            <div>
              <span>
                Risk probability
              </span>

              <b>
                {selectedNode.risk}%
              </b>
            </div>

            <div>
              <span>
                Estimated onset
              </span>

              <b>
                {selectedNode.onset}
              </b>
            </div>
          </div>

          <button className="button button-primary full-button">
            Acknowledge impact
          </button>
        </Panel>
      </div>
    </>
  );
}

function Routing({
  incident,
  onBack,
}: {
  incident: Incident;
  onBack: () => void;
}) {
  const profile =
    responseProfiles[incident.id];

  const [unitId, setUnitId] =
    useState(profile.units[0].id);

  const [routeId, setRouteId] =
    useState("");

  const [routeOptions, setRouteOptions] =
    useState<RouteOption[]>([]);

  const [routeError, setRouteError] =
    useState("");

  const unit =
    profile.units.find(
      (item) => item.id === unitId
    ) ?? profile.units[0];

  const origin =
    infrastructureAssets.find(
      (asset) =>
        asset.id === unit.baseAssetId
    ) ?? infrastructureAssets[0];

  const target =
    infrastructureAssets.find(
      (asset) =>
        asset.id ===
        profile.targetAssetId
    ) ?? infrastructureAssets[0];

  const route =
    routeOptions.find(
      (item) =>
        item.id === routeId
    ) ??
    routeOptions[0] ??
    profile.routes[0];

  const routeReady =
    routeOptions.length > 0;

  useEffect(() => {
    const controller =
      new AbortController();

    const loadRoutes =
      async () => {
        setRouteOptions([]);
        setRouteId("");
        setRouteError("");

        if (
          origin.lat == null ||
          origin.lng == null ||
          target.lat == null ||
          target.lng == null
        ) {
          setRouteError(
            "Route unavailable: the selected base or incident has no coordinates."
          );
          return;
        }

        try {
          const url =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${origin.lng},${origin.lat};${target.lng},${target.lat}` +
            `?alternatives=true&overview=full&geometries=geojson`;

          const response =
            await fetch(url, {
              signal:
                controller.signal,
            });

          if (!response.ok)
            throw new Error(
              `OSRM request failed (${response.status})`
            );

          const data =
            (await response.json()) as {
              code: string;
              routes?: {
                distance: number;
                duration: number;
                geometry: RouteOption["geometry"];
              }[];
            };

          if (
            data.code !== "Ok" ||
            !data.routes?.length
          ) {
            throw new Error(
              "OSRM returned no drivable routes."
            );
          }

          const options = [
            ...data.routes,
          ]
            .sort(
              (a, b) =>
                a.duration -
                b.duration
            )
            .map(
              (
                osrmRoute,
                index
              ) => {
                const mock =
                  profile.routes[
                    index
                  ] ??
                  profile.routes[
                    profile.routes
                      .length - 1
                  ];

                return {
                  ...mock,
                  id: `osrm-route-${
                    index + 1
                  }`,
                  name:
                    index === 0
                      ? "Fastest road route"
                      : `Alternative road route ${index}`,
                  distance: `${(
                    osrmRoute.distance /
                    1000
                  ).toFixed(1)} km`,
                  eta: `${Math.ceil(
                    osrmRoute.duration /
                      60
                  )} min`,
                  geometry:
                    osrmRoute.geometry,
                  routeRank:
                    index + 1,
                  recommended:
                    index === 0,
                  explanation:
                    index === 0
                      ? "Fastest route returned by OSRM over the current road network; mock risk values are shown for response planning."
                      : mock.explanation,
                };
              }
            );

          setRouteOptions(
            options
          );

          setRouteId(
            options[0].id
          );
        } catch (error) {
          if (
            !controller.signal
              .aborted
          ) {
            setRouteError(
              error instanceof
                Error
                ? error.message
                : "Unable to calculate a road route."
            );
          }
        }
      };

    void loadRoutes();

    return () =>
      controller.abort();
  }, [
    incident.id,
    origin.id,
    target.id,
  ]);

  return (
    <div className="response-layout">
      <div className="response-heading">
        <div>
          <button
            className="text-button"
            onClick={onBack}
          >
            ← Back to incident
          </button>

          <span className="eyebrow">
            RESPONSE &amp; ROUTING ·{" "}
            {incident.id}
          </span>

          <h2>{incident.title}</h2>

          <p>
            {incident.location} ·{" "}
            {incident.type}
          </p>
        </div>

        <div className="response-heading-tags">
          <SeverityTag
            severity={incident.severity}
          />

          <StatusTag
            status={incident.status}
          />
        </div>
      </div>

      <div className="response-context">
        <span>
          <small>INCIDENT</small>
          <b>{incident.title}</b>
        </span>

        <span>
          <small>LOCATION</small>
          <b>{target.name}</b>
        </span>

        <span>
          <small>SEVERITY</small>
          <SeverityTag
            severity={incident.severity}
          />
        </span>

        <span>
          <small>STATUS</small>
          <StatusTag
            status={incident.status}
          />
        </span>
      </div>

      <div className="response-grid">
        <Panel
          title="Recommended response route"
          eyebrow={`${unit.department.toUpperCase()} · LIVE MAP`}
          className="response-map-panel"
        >
          <DigitalTwinMap
            assets={infrastructureAssets}
            locations={monitoredLocations}
            layers={{
              roads: true,
              buildings: true,
              hospitals: true,
              fire: true,
              police: true,
              electricity: true,
              water: true,
              emergency: true,
              locations: true,
            }}
            selectedAsset={target}
            selectedLocation={null}
            onAsset={() =>
              undefined
            }
            onLocation={() =>
              undefined
            }
            route={{
              origin,
              target,
              option: route,
              alternatives:
                routeOptions,
            }}
          />

          {routeError && (
            <p className="route-error">
              Road routing unavailable:{" "}
              {routeError}
            </p>
          )}

          <div className="route-legend">
            <span>
              <i className="route-dot base" />
              Base · {origin.name}
            </span>

            <span>
              <i className="route-dot incident" />
              Incident ·{" "}
              {target.name}
            </span>

            <span>
              <i className="route-line-sample" />
              Selected road route
            </span>
          </div>
        </Panel>

        <div className="response-side">
          <Panel
            title="Emergency department"
            eyebrow="ASSIGNED RESPONSE NETWORK"
          >
            <div className="response-department">
              <span className="asset-large">
                ◆
              </span>

              <div>
                <h2>
                  {unit.department}
                </h2>

                <p>
                  Selected for{" "}
                  {incident.type.toLowerCase()}
                </p>
              </div>
            </div>

            <div className="unit-list">
              {profile.units.map(
                (availableUnit) => (
                  <button
                    className={`unit-option ${
                      availableUnit.id ===
                      unit.id
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      setUnitId(
                        availableUnit.id
                      )
                    }
                    key={
                      availableUnit.id
                    }
                  >
                    <span>
                      <b>
                        {
                          availableUnit.name
                        }
                      </b>

                      <small>
                        Base:{" "}
                        {infrastructureAssets.find(
                          (asset) =>
                            asset.id ===
                            availableUnit.baseAssetId
                        )?.name ??
                          "Response base"}
                      </small>
                    </span>

                    <StatusTag
                      status={
                        availableUnit.status
                      }
                    />
                  </button>
                )
              )}
            </div>
          </Panel>

          <Panel
            title="Recommended route"
            eyebrow="FASTEST SAFE RESPONSE"
          >
            <div className="route-metrics">
              <div>
                <span>
                  Distance
                </span>

                <b>
                  {routeReady
                    ? route.distance
                    : "—"}
                </b>
              </div>

              <div>
                <span>ETA</span>

                <b>
                  {routeReady
                    ? route.eta
                    : "—"}
                </b>
              </div>

              <div>
                <span>Risk</span>

                <b
                  className={
                    route.risk ===
                    "LOW"
                      ? "text-green"
                      : "text-orange"
                  }
                >
                  {routeReady
                    ? route.risk
                    : "—"}
                </b>
              </div>

              <div>
                <span>
                  Blockage
                </span>

                <b>
                  {routeReady
                    ? route.blockage
                    : "—"}
                </b>
              </div>

              <div>
                <span>
                  Traffic
                </span>

                <b>
                  {routeReady
                    ? route.traffic
                    : "—"}
                </b>
              </div>

              <div>
                <span>Hazard</span>

                <b>
                  {routeReady
                    ? route.hazard
                    : "—"}
                </b>
              </div>
            </div>

            <p className="route-explanation">
              {routeReady
                ? route.explanation
                : routeError ||
                  "Calculating road-network routes..."}
            </p>

            <button className="button button-primary full-button">
              Dispatch{" "}
              {unit.name}
            </button>
          </Panel>

          <Panel
            title="Alternative routes"
            eyebrow="INSPECT RESPONSE OPTIONS"
          >
            <div className="route-options">
              {routeOptions.length ? (
                routeOptions.map(
                  (option) => (
                    <button
                      className={`route-option ${
                        option.id ===
                        route.id
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setRouteId(
                          option.id
                        )
                      }
                      key={option.id}
                    >
                      <span className="radio">
                        {option.id ===
                        route.id
                          ? "●"
                          : "○"}
                      </span>

                      <span>
                        <b>
                          Rank{" "}
                          {
                            option.routeRank
                          }{" "}
                          ·{" "}
                          {
                            option.name
                          }
                        </b>

                        <small>
                          {
                            option.distance
                          }{" "}
                          ·{" "}
                          {
                            option.traffic
                          }{" "}
                          traffic ·{" "}
                          {option.recommended
                            ? "Recommended"
                            : "Alternative"}
                        </small>
                      </span>

                      <strong>
                        {option.eta}
                        <small>
                          {option.risk}{" "}
                          risk
                        </small>
                      </strong>
                    </button>
                  )
                )
              ) : (
                <p className="muted-copy">
                  Calculating road-network
                  routes...
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function LegacyRouting() {
  const [route, setRoute] =
    useState("recommended");

  return (
    <div className="routing-layout">
      <Panel
        title="Response route"
        eyebrow="UNIT F03 · FIRE SERVICES"
        className="route-map-panel"
      >
        <div className="route-map">
          <OperationalMap compact />

          <div className="route-line" />

          <div className="route-pin start">
            F03
          </div>

          <div className="route-pin end">
            INC
          </div>
        </div>

        <div className="route-summary">
          <div>
            <span>
              Estimated arrival
            </span>
            <b>08 min</b>
          </div>

          <div>
            <span>Distance</span>
            <b>2.4 km</b>
          </div>

          <div>
            <span>
              Hazard exposure
            </span>
            <b className="text-orange">
              MODERATE
            </b>
          </div>
        </div>
      </Panel>

      <Panel
        title="Route options"
        eyebrow="SELECT A DEPLOYMENT PATH"
      >
        <div className="route-options">
          {[
            [
              "recommended",
              "Recommended route",
              "08 min",
              "Low blockage risk",
              "Uses 100 Feet Road. Traffic diversion active.",
            ],
            [
              "alternate",
              "Alternative route A",
              "11 min",
              "Low hazard exposure",
              "Longer route via 12th Main. Clear access.",
            ],
            [
              "secondary",
              "Alternative route B",
              "14 min",
              "High blockage risk",
              "Avoids fire zone but crosses R12 congestion.",
            ],
          ].map(
            ([
              id,
              name,
              time,
              risk,
              note,
            ]) => (
              <button
                className={`route-option ${
                  route === id
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setRoute(id)
                }
                key={id}
              >
                <span className="radio">
                  {route === id
                    ? "●"
                    : "○"}
                </span>

                <span>
                  <b>{name}</b>
                  <small>
                    {note}
                  </small>
                </span>

                <strong>
                  {time}
                  <small>
                    {risk}
                  </small>
                </strong>
              </button>
            )
          )}
        </div>

        <button className="button button-primary full-button">
          Dispatch Fire Unit F03
        </button>
      </Panel>
    </div>
  );
}

type DepartmentProfile = {
  name: string;
  staff: string;
  activeIncidents: string;
  priority: string;
  unitLabel: string;
  incident: Incident;
  targetId: string;
  originId: string;
  effects: string[];
  updates: {
    time: string;
    text: string;
  }[];
  actions: {
    status: string;
    text: string;
  }[];
  route: RouteOption;
  alternatives: RouteOption[];
};

const routeForDepartment = (
  originId: string,
  targetId: string,
  name: string,
  distance: string,
  eta: string,
  risk: string,
  explanation: string
): RouteOption => {
  return {
    id: `${originId}-${targetId}-${name
      .toLowerCase()
      .replaceAll(" ", "-")}`,
    name,
    distance,
    eta,
    risk,
    blockage:
      risk === "LOW"
        ? "12%"
        : "38%",
    traffic:
      risk === "HIGH"
        ? "Heavy"
        : "Moderate",
    hazard:
      risk === "HIGH"
        ? "High exposure"
        : "Low exposure",
    explanation,
    offset: 0,
  };
};

const departmentProfiles: Record<
  DepartmentId,
  DepartmentProfile
> = {
  fire: {
    name: "Fire Department",
    staff: "6 units",
    activeIncidents:
      "2 active incidents",
    priority: "CRITICAL",
    unitLabel: "Fire units",
    incident: incidents[0],
    targetId: "B-A",
    originId: "F03",
    effects: [
      "Fire spread risk remains elevated on floor 3.",
      "Road R12 access is affected by the emergency cordon.",
      "Transformer T4 is within the secondary hazard zone.",
    ],
    updates: [
      {
        time: "14:32",
        text: "Traffic Unit T02 closed Road R12.",
      },
      {
        time: "14:29",
        text: "Fire Unit F03 dispatched toward Building A.",
      },
      {
        time: "14:27",
        text: "Transformer T4 risk increased to 72%.",
      },
      {
        time: "14:24",
        text: "Hospital H1 placed on standby.",
      },
    ],
    actions: [
      {
        status: "IN PROGRESS",
        text: "Dispatch Fire Unit F03",
      },
      {
        status: "PENDING",
        text: "Deploy backup suppression unit",
      },
      {
        status: "COMPLETED",
        text: "Establish emergency perimeter",
      },
    ],
    route: routeForDepartment(
      "F03",
      "B-A",
      "Route B",
      "4.8 km",
      "7 min",
      "LOW",
      "Route B recommended because Route A has high predicted blockage risk on Road R12."
    ),
    alternatives: [
      routeForDepartment(
        "F03",
        "B-A",
        "Route A",
        "4.2 km",
        "6 min",
        "HIGH",
        "Shorter route, but crosses the active R12 blockage."
      ),
    ],
  },

  traffic: {
    name: "Traffic Department",
    staff: "5 units",
    activeIncidents:
      "1 active incident",
    priority: "HIGH",
    unitLabel: "Traffic units",
    incident: incidents[2],
    targetId: "R12",
    originId: "P02",
    effects: [
      "Road R12 blockage risk is 71%.",
      "Congestion is building at the east junction.",
      "A dedicated emergency corridor is required for fire access.",
    ],
    updates: [
      {
        time: "14:35",
        text: "Queue spillback detected at Road R12 northbound lane.",
      },
      {
        time: "14:31",
        text: "Traffic Unit T05 started the 12th Main diversion.",
      },
      {
        time: "14:28",
        text: "Emergency corridor request received from Fire.",
      },
      {
        time: "14:22",
        text: "Signal timing changed at East Junction.",
      },
    ],
    actions: [
      {
        status: "IN PROGRESS",
        text: "Maintain R12 diversion",
      },
      {
        status: "PENDING",
        text: "Deploy recovery vehicle T08",
      },
      {
        status: "COMPLETED",
        text: "Close northbound R12 lane",
      },
    ],
    route: routeForDepartment(
      "P02",
      "R12",
      "East Junction Approach",
      "2.7 km",
      "6 min",
      "HIGH",
      "Police-station approach is recommended because it avoids the blocked northbound lane."
    ),
    alternatives: [
      routeForDepartment(
        "P02",
        "R12",
        "12th Main Diversion",
        "4.1 km",
        "9 min",
        "LOW",
        "The diversion is slower but provides a clear recovery path."
      ),
    ],
  },

  police: {
    name: "Police Department",
    staff: "12 units",
    activeIncidents:
      "3 active incidents",
    priority: "HIGH",
    unitLabel: "Police units",
    incident: incidents[0],
    targetId: "B-A",
    originId: "P02",
    effects: [
      "Security and crowd-control coverage is required around Building A.",
      "The emergency perimeter must protect the fire corridor.",
      "Pedestrian movement is increasing near the cordon.",
    ],
    updates: [
      {
        time: "14:33",
        text: "Police Unit P02 expanded the Building A perimeter.",
      },
      {
        time: "14:29",
        text: "Fire Unit F03 requested crowd-control support.",
      },
      {
        time: "14:26",
        text: "Pedestrian flow redirected from the east entrance.",
      },
      {
        time: "14:20",
        text: "Additional patrol assigned to R12 closure.",
      },
    ],
    actions: [
      {
        status: "IN PROGRESS",
        text: "Extend Building A cordon",
      },
      {
        status: "PENDING",
        text: "Deploy two crowd-control units",
      },
      {
        status: "COMPLETED",
        text: "Secure the east access point",
      },
    ],
    route: routeForDepartment(
      "P02",
      "B-A",
      "Perimeter Access Route",
      "3.5 km",
      "8 min",
      "LOW",
      "The police-station route keeps the unit outside the active fire approach."
    ),
    alternatives: [
      routeForDepartment(
        "P02",
        "B-A",
        "R12 Direct",
        "2.8 km",
        "6 min",
        "HIGH",
        "Direct approach exposes the unit to the blocked emergency corridor."
      ),
    ],
  },

  medical: {
    name: "Medical Department",
    staff: "7 units",
    activeIncidents:
      "1 active incident",
    priority: "HIGH",
    unitLabel: "Medical teams",
    incident: incidents[0],
    targetId: "H1",
    originId: "ER1",
    effects: [
      "Hospital H1 may receive a surge of emergency patients.",
      "Ambulance access is constrained by Road R12.",
      "Emergency preparedness and standby intake are required.",
    ],
    updates: [
      {
        time: "14:34",
        text: "Hospital H1 placed on emergency standby.",
      },
      {
        time: "14:30",
        text: "Ambulance approach checked against R12 closure.",
      },
      {
        time: "14:25",
        text: "Additional triage team moved to the east intake.",
      },
      {
        time: "14:18",
        text: "Backup generator readiness confirmed at H1.",
      },
    ],
    actions: [
      {
        status: "IN PROGRESS",
        text: "Prepare H1 intake diversion",
      },
      {
        status: "PENDING",
        text: "Stage ambulance cover at East Rescue Centre",
      },
      {
        status: "COMPLETED",
        text: "Test hospital backup power",
      },
    ],
    route: routeForDepartment(
      "ER1",
      "H1",
      "Hospital Access Route",
      "3.2 km",
      "8 min",
      "MEDIUM",
      "This route protects ambulance access while avoiding the closed section of Road R12."
    ),
    alternatives: [
      routeForDepartment(
        "ER1",
        "H1",
        "R12 Approach",
        "2.5 km",
        "6 min",
        "HIGH",
        "Shortest route, but exposed to active congestion near R12."
      ),
    ],
  },

  electricity: {
    name: "Electricity Department",
    staff: "4 crews",
    activeIncidents:
      "2 assets at risk",
    priority: "HIGH",
    unitLabel: "Grid crews",
    incident: incidents[1],
    targetId: "T4",
    originId: "EB1",
    effects: [
      "Transformer T4 is at 72% risk and may fail under heat exposure.",
      "Possible power disruption affects the east sector.",
      "Hospital H1 and Water Pump W2 require protected supply.",
    ],
    updates: [
      {
        time: "14:32",
        text: "Transformer T4 risk increased to 72%.",
      },
      {
        time: "14:27",
        text: "Grid Crew E12 prepared an isolation plan.",
      },
      {
        time: "14:23",
        text: "Hospital H1 backup supply confirmed.",
      },
      {
        time: "14:16",
        text: "Load transfer window opened on feeder T6.",
      },
    ],
    actions: [
      {
        status: "IN PROGRESS",
        text: "Isolate Transformer T4 if risk exceeds 80%",
      },
      {
        status: "PENDING",
        text: "Transfer east-sector load to feeder T6",
      },
      {
        status: "COMPLETED",
        text: "Verify H1 backup generation",
      },
    ],
    route: routeForDepartment(
      "EB1",
      "T4",
      "Feeder Service Route",
      "3.1 km",
      "9 min",
      "MEDIUM",
      "The feeder route keeps the crew on the utility corridor and away from the hospital approach."
    ),
    alternatives: [
      routeForDepartment(
        "EB1",
        "T4",
        "Ring Road Alternative",
        "4.6 km",
        "12 min",
        "LOW",
        "The ring road has lower exposure but adds three minutes."
      ),
    ],
  },

  water: {
    name: "Water Department",
    staff: "3 crews",
    activeIncidents:
      "1 asset at risk",
    priority: "MEDIUM",
    unitLabel: "Water crews",
    incident: incidents[3],
    targetId: "W2",
    originId: "ER1",
    effects: [
      "Pump W2 has a disruption risk in the east pressure zone.",
      "Reduced pumping could lower water pressure across the network.",
      "Fire suppression supply must remain available.",
    ],
    updates: [
      {
        time: "14:31",
        text: "Pump W2 pressure fell below the monitoring threshold.",
      },
      {
        time: "14:26",
        text: "Water Crew W07 dispatched to the pump station.",
      },
      {
        time: "14:21",
        text: "Fire services requested hydrant pressure confirmation.",
      },
      {
        time: "14:12",
        text: "Southern utility route confirmed clear.",
      },
    ],
    actions: [
      {
        status: "IN PROGRESS",
        text: "Monitor Pump W2 pressure",
      },
      {
        status: "PENDING",
        text: "Stage backup pump technician W11",
      },
      {
        status: "COMPLETED",
        text: "Verify fire hydrant pressure",
      },
    ],
    route: routeForDepartment(
      "ER1",
      "W2",
      "Domlur Service Route",
      "3.8 km",
      "11 min",
      "MEDIUM",
      "The service route reaches W2 directly while avoiding the busiest junction near the pressure-drop zone."
    ),
    alternatives: [
      routeForDepartment(
        "ER1",
        "W2",
        "Southern Utility Route",
        "5.2 km",
        "15 min",
        "LOW",
        "Lower congestion, but a longer approach to the pump."
      ),
    ],
  },

  infrastructure: {
    name: "Infrastructure Department",
    staff: "8 teams",
    activeIncidents:
      "4 assets tracked",
    priority: "CRITICAL",
    unitLabel: "Response teams",
    incident: incidents[0],
    targetId: "B-A",
    originId: "ER1",
    effects: [
      "Building A is a critical asset with active structural and fire risk.",
      "Road R12 may become inaccessible if the incident escalates.",
      "Connected utility assets T4 and W2 are exposed to cascading effects.",
    ],
    updates: [
      {
        time: "14:36",
        text: "Building A structural risk review started.",
      },
      {
        time: "14:30",
        text: "East Rescue Centre assigned assessment team R21.",
      },
      {
        time: "14:24",
        text: "R12 corridor inspection requested.",
      },
      {
        time: "14:17",
        text: "Connected asset risk model refreshed.",
      },
    ],
    actions: [
      {
        status: "IN PROGRESS",
        text: "Inspect Building A structural condition",
      },
      {
        status: "PENDING",
        text: "Stage rescue team R21",
      },
      {
        status: "COMPLETED",
        text: "Map connected critical assets",
      },
    ],
    route: routeForDepartment(
      "ER1",
      "B-A",
      "Assessment Route",
      "4.4 km",
      "10 min",
      "LOW",
      "The rescue-centre route keeps the assessment team on the southern access corridor."
    ),
    alternatives: [
      routeForDepartment(
        "ER1",
        "B-A",
        "R12 Corridor",
        "3.6 km",
        "8 min",
        "HIGH",
        "Faster on paper, but exposed to the active R12 blockage."
      ),
    ],
  },
};

function Departments({
  onSelect,
}: {
  onSelect: (
    department: DepartmentId
  ) => void;
}) {
  return (
    <div className="department-grid">
      {(
        Object.entries(
          departmentProfiles
        ) as [
          DepartmentId,
          DepartmentProfile
        ][]
      ).map(
        ([id, profile]) => (
          <button
            className="department-card panel"
            onClick={() =>
              onSelect(id)
            }
            key={id}
          >
            <div className="panel-header">
              <div>
                <span className="eyebrow">
                  ONLINE
                </span>

                <h2>
                  {profile.name.replace(
                    " Department",
                    ""
                  )}
                </h2>
              </div>

              <span className="department-open">
                ↗
              </span>
            </div>

            <div className="department-stat">
              <b>{profile.staff}</b>
              <span>
                {profile.activeIncidents}
              </span>
            </div>

            <div className="department-action">
              <span>
                Next recommended action
              </span>

              <b>
                {profile.actions[0].text}
              </b>
            </div>

            <span className="text-button">
              Open department dashboard ↗
            </span>
          </button>
        )
      )}
    </div>
  );
}

function DepartmentDashboard({
  departmentId,
  onBack,
  requests,
  onRequest,
  onUpdateRequest,
}: {
  departmentId: DepartmentId;
  onBack: () => void;
  requests: CoordinationRequest[];
  onRequest: (
    request: CoordinationRequest
  ) => void;
  onUpdateRequest: (
    id: string,
    updates: Partial<CoordinationRequest>
  ) => void;
}) {
  const profile =
    departmentProfiles[departmentId];

  const target =
    infrastructureAssets.find(
      (asset) =>
        asset.id === profile.targetId
    ) ?? infrastructureAssets[0];

  const origin =
    infrastructureAssets.find(
      (asset) =>
        asset.id === profile.originId
    ) ?? infrastructureAssets[0];

  const [routes, setRoutes] =
    useState<RouteCandidate[]>([]);

  const [routeId, setRouteId] =
    useState("");

  const [routeLoading, setRouteLoading] =
    useState(false);

  const [routeError, setRouteError] =
    useState("");

  const [assistanceOpen, setAssistanceOpen] =
    useState(false);

  const [requestTo, setRequestTo] =
    useState("Traffic Department");

  const [
    requestIncidentId,
    setRequestIncidentId,
  ] = useState(profile.incident.id);

  const [priority, setPriority] =
    useState("High");

  const [help, setHelp] =
    useState("");

  const [confirmation, setConfirmation] =
    useState(false);

  const [openRequestId, setOpenRequestId] =
    useState<string | null>(null);

  useEffect(() => {
    setRequestTo(
      profile.name ===
        "Traffic Department"
        ? "Fire Department"
        : "Traffic Department"
    );

    setRequestIncidentId(
      profile.incident.id
    );

    setPriority("High");
    setHelp("");
    setConfirmation(false);
    setOpenRequestId(null);
  }, [departmentId, profile]);

  const receivedRequests =
    requests.filter(
      (request) =>
        request.to === profile.name
    );

  const sentRequests =
    requests.filter(
      (request) =>
        request.from === profile.name
    );

  const activeRequest =
    receivedRequests.find(
      (request) =>
        request.id ===
        openRequestId
    );

  const requestIncident =
    activeRequest
      ? incidents.find(
          (incident) =>
            incident.id ===
            activeRequest.incidentId
        )
      : undefined;

  const mapTarget =
    activeRequest
      ? infrastructureAssets.find(
          (asset) =>
            requestIncident?.affectedInfrastructure.includes(
              asset.name
            )
        ) ?? target
      : target;

  useEffect(() => {
    const controller =
      new AbortController();

    setRouteLoading(true);
    setRouteError("");
    setRoutes([]);
    setRouteId("");

    fetchDrivingRoutes(
      origin,
      mapTarget,
      controller.signal
    )
      .then((roadRoutes) => {
        const candidates =
          roadRoutes.map(
            (roadRoute, index) => ({
              ...scoreRoute(
                roadRoute,
                obstacles
              ),
              id: `${departmentId}-road-route-${
                index + 1
              }`,
              name:
                index === 0
                  ? "Route A"
                  : `Route ${String.fromCharCode(
                      65 + index
                    )}`,
              routeRank:
                index + 1,
              recommended: false,
            })
          );

        const recommended =
          candidates.reduce<
            RouteCandidate | undefined
          >(
            (
              best,
              candidate
            ) =>
              !best ||
              candidate.score <
                best.score
                ? candidate
                : best,
            undefined
          );

        const ranked =
          candidates.map(
            (candidate) => ({
              ...candidate,
              recommended:
                candidate.id ===
                recommended?.id,
            })
          );

        setRoutes(ranked);

        setRouteId(
          recommended?.id ?? ""
        );
      })
      .catch((error) => {
        if (
          error instanceof
            DOMException &&
          error.name ===
            "AbortError"
        )
          return;

        setRouteError(
          "Route calculation unavailable"
        );
      })
      .finally(() =>
        setRouteLoading(false)
      );

    return () =>
      controller.abort();
  }, [
    departmentId,
    origin,
    mapTarget,
  ]);

  const selectedRoute =
    routes.find(
      (route) =>
        route.id === routeId
    ) ??
    routes.find(
      (route) => route.recommended
    );

  const openReceivedRequest = (
    request: CoordinationRequest
  ) => {
    setOpenRequestId(request.id);

    if (
      request.status ===
      "PENDING"
    ) {
      onUpdateRequest(
        request.id,
        {
          status:
            "ACTION REQUIRED",
        }
      );
    }
  };

  const startReceivedAction = () => {
    if (!activeRequest) return;

    onUpdateRequest(
      activeRequest.id,
      {
        status: "IN PROGRESS",
        currentAction:
          profile.name ===
          "Traffic Department"
            ? "Traffic Unit T02 deployed to R12."
            : `${profile.name} response team deployed to the incident area.`,
      }
    );
  };

  const completeReceivedAction = () => {
    if (!activeRequest) return;

    onUpdateRequest(
      activeRequest.id,
      {
        status: "COMPLETED",
        currentAction:
          profile.name ===
          "Traffic Department"
            ? "Emergency corridor cleared."
            : `${profile.name} action completed at the incident.`,
      }
    );
  };

  const submitRequest = () => {
    const incident =
      incidents.find(
        (item) =>
          item.id ===
          requestIncidentId
      );

    const trimmedHelp =
      help.trim();

    if (
      !trimmedHelp ||
      !requestTo ||
      !priority ||
      !incident ||
      requestTo === profile.name
    ) {
      return;
    }

    onRequest({
      id: `${profile.name}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      from: profile.name,
      to: requestTo,
      incidentId: incident.id,
      incidentTitle:
        incident.title,
      priority,
      help: trimmedHelp,
      status: "PENDING",
      currentAction:
        "Awaiting receiving department action.",
      createdAt:
        new Date().toLocaleTimeString(
          [],
          {
            hour: "2-digit",
            minute: "2-digit",
          }
        ),
    });

    setHelp("");
    setAssistanceOpen(false);
    setConfirmation(true);
  };

  return (
    <div className="department-dashboard">
      <button
        className="text-button department-back"
        onClick={onBack}
      >
        ← Back to Departments
      </button>

      <section className="department-hero">
        <div>
          <span className="eyebrow">
            DEPARTMENT OPERATIONS · LIVE
          </span>

          <h2>
            {profile.name} Dashboard
          </h2>

          <p>
            {profile.incident.title} ·{" "}
            {profile.incident.location}
          </p>
        </div>

        <div className="department-hero-status">
          <StatusTag status="Online" />

          <span>
            <b>{profile.staff}</b>
            <small>
              ACTIVE UNITS / CREWS
            </small>
          </span>

          <span>
            <b>
              {
                profile.activeIncidents.split(
                  " "
                )[0]
              }
            </b>

            <small>
              ACTIVE INCIDENTS
            </small>
          </span>

          <span>
            <b className="text-red">
              {profile.priority}
            </b>

            <small>
              CURRENT PRIORITY
            </small>
          </span>
        </div>
      </section>

      <Panel
        title="Notifications"
        eyebrow="INTERDEPARTMENTAL ALERTS"
      >
        <div className="notification-list">
          {receivedRequests.length ? (
            receivedRequests.map(
              (request) => (
                <button
                  className={`notification-item ${
                    request.status ===
                    "PENDING"
                      ? "notification-new"
                      : ""
                  }`}
                  key={request.id}
                  onClick={() =>
                    openReceivedRequest(
                      request
                    )
                  }
                >
                  <span className="notification-dot-large" />

                  <span>
                    <b>
                      {request.status ===
                      "PENDING"
                        ? "NEW ASSISTANCE REQUEST"
                        : request.status}
                    </b>

                    <small>
                      {request.from} →{" "}
                      {profile.name} ·{" "}
                      {request.createdAt}
                    </small>

                    <strong>
                      {
                        request.incidentTitle
                      }
                    </strong>

                    <em>
                      Priority:{" "}
                      {request.priority}
                    </em>
                  </span>
                </button>
              )
            )
          ) : (
            <p className="muted-copy">
              No incoming assistance
              requests.
            </p>
          )}
        </div>
      </Panel>

      {activeRequest && (
        <Panel
          title="Assistance Request"
          eyebrow="ACTION REQUIRED"
        >
          <div className="assistance-detail">
            <div>
              <span>
                <b>FROM</b>
                {activeRequest.from}
              </span>

              <span>
                <b>INCIDENT</b>
                {
                  activeRequest.incidentTitle
                }
              </span>

              <span>
                <b>PRIORITY</b>
                {activeRequest.priority}
              </span>

              <span>
                <b>
                  HELP REQUIRED
                </b>
                {activeRequest.help}
              </span>

              <span>
                <b>STATUS</b>
                <StatusTag
                  status={
                    activeRequest.status
                  }
                />
              </span>

              <span>
                <b>
                  CURRENT ACTION
                </b>
                {
                  activeRequest.currentAction
                }
              </span>

              <span>
                <b>TIMESTAMP</b>
                {
                  activeRequest.createdAt
                }
              </span>
            </div>

            <div className="assistance-actions">
              {activeRequest.status ===
                "ACTION REQUIRED" && (
                <button
                  className="button button-primary"
                  onClick={
                    startReceivedAction
                  }
                >
                  START ACTION
                </button>
              )}

              {activeRequest.status ===
                "IN PROGRESS" && (
                <button
                  className="button button-primary"
                  onClick={
                    completeReceivedAction
                  }
                >
                  MARK COMPLETED
                </button>
              )}
            </div>
          </div>
        </Panel>
      )}

      <Panel
        title="Emergency / priority incident"
        eyebrow="CRITICAL RESPONSE"
      >
        <div className="department-incident">
          <div>
            <span className="eyebrow">
              {profile.incident.id}
            </span>

            <h2>
              {profile.incident.title}
            </h2>

            <p>
              {profile.incident.location} ·{" "}
              {profile.incident.type}
            </p>
          </div>

          <div>
            <SeverityTag
              severity={
                profile.incident
                  .severity
              }
            />

            <StatusTag
              status={
                profile.incident.status
              }
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Immediate effects"
        eyebrow={`${profile.name.toUpperCase()} · IMPACT MONITORING`}
      >
        <div className="department-effects">
          {profile.effects.map(
            (effect) => (
              <div key={effect}>
                <span className="effect-mark">
                  !
                </span>

                <b>{effect}</b>
              </div>
            )
          )}
        </div>
      </Panel>

      <div className="department-dashboard-grid">
        <Panel
          title="Current / assigned actions"
          eyebrow="OPERATIONS"
        >
          <div className="department-actions">
            {profile.actions.map(
              (action) => (
                <div
                  key={action.text}
                >
                  <span
                    className={`action-status ${action.status
                      .toLowerCase()
                      .replace(
                        " ",
                        "-"
                      )}`}
                  >
                    {action.status}
                  </span>

                  <b>{action.text}</b>
                </div>
              )
            )}
          </div>
        </Panel>

        <Panel
          title="Emergency route"
          eyebrow={`${profile.unitLabel.toUpperCase()} · ROAD NETWORK`}
        >
          {routeLoading && (
            <p className="route-loading">
              Calculating road-network
              routes...
            </p>
          )}

          {routeError && (
            <p className="route-error">
              Route calculation
              unavailable
            </p>
          )}

          {selectedRoute && (
            <>
              <div className="department-route-summary">
                <div>
                  <small>
                    RESPONSE
                  </small>

                  <b>
                    {profile.unitLabel} →{" "}
                    {mapTarget.name}
                  </b>
                </div>

                <div>
                  <small>
                    RECOMMENDED ROUTE
                  </small>

                  <b>
                    {
                      selectedRoute.name
                    }

                    {selectedRoute.recommended
                      ? " · RECOMMENDED"
                      : ""}
                  </b>
                </div>

                <div>
                  <small>
                    ROAD DISTANCE / ETA
                  </small>

                  <b>
                    {
                      selectedRoute.distance
                    }{" "}
                    ·{" "}
                    {
                      selectedRoute.eta
                    }
                  </b>
                </div>

                <div>
                  <small>
                    ROUTE RISK
                  </small>

                  <b
                    className={
                      selectedRoute.risk ===
                      "LOW"
                        ? "text-green"
                        : "text-orange"
                    }
                  >
                    {
                      selectedRoute.risk
                    }
                  </b>
                </div>
              </div>

              <p className="route-explanation">
                {
                  selectedRoute.explanation
                }
              </p>

              <div className="route-options">
                {routes.map(
                  (route) => (
                    <button
                      className={`route-option ${
                        route.id ===
                        selectedRoute.id
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setRouteId(
                          route.id
                        )
                      }
                      key={route.id}
                    >
                      <span className="radio">
                        {route.id ===
                        selectedRoute.id
                          ? "●"
                          : "○"}
                      </span>

                      <span>
                        <b>
                          {route.name}

                          {route.recommended
                            ? " · RECOMMENDED"
                            : ""}
                        </b>

                        <small>
                          {
                            route.distance
                          }{" "}
                          ·{" "}
                          {
                            route.traffic
                          }{" "}
                          traffic ·{" "}
                          {route.hazard}
                        </small>
                      </span>

                      <strong>
                        {route.eta}

                        <small>
                          {route.risk}{" "}
                          risk
                        </small>
                      </strong>
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </Panel>
      </div>

      <Panel
        title="Operational map"
        eyebrow={`${profile.name.toUpperCase()} · ROAD NETWORK`}
        className="department-map-panel"
      >
        <DigitalTwinMap
          assets={infrastructureAssets}
          locations={monitoredLocations}
          layers={{
            roads: true,
            buildings: true,
            hospitals: true,
            fire: true,
            police: true,
            electricity: true,
            water: true,
            emergency: true,
            locations: true,
          }}
          selectedAsset={mapTarget}
          selectedLocation={null}
          onAsset={() =>
            undefined
          }
          onLocation={() =>
            undefined
          }
          route={
            selectedRoute
              ? {
                  origin,
                  target: mapTarget,
                  option:
                    selectedRoute,
                  alternatives:
                    routes,
                  obstacles:
                    selectedRoute.obstacles,
                }
              : undefined
          }
        />

        {routeLoading && (
          <p className="route-loading">
            Calculating road-network
            routes...
          </p>
        )}

        {routeError && (
          <p className="route-error">
            Route calculation
            unavailable
          </p>
        )}
      </Panel>

      <Panel
        title="Live Regional Updates"
        eyebrow="CHRONOLOGICAL FEED"
      >
        <div className="regional-updates">
          {profile.updates.map(
            (update) => (
              <div
                key={`${update.time}-${update.text}`}
              >
                <time>
                  {update.time}
                </time>

                <span>
                  {update.text}
                </span>
              </div>
            )
          )}
        </div>
      </Panel>

      <Panel
        title="Coordination Requests"
        eyebrow="INTER-DEPARTMENT SUPPORT"
      >
        <div className="coordination-sections">
          <section>
            <h3>RECEIVED</h3>

            <div className="coordination-list">
              {receivedRequests.length ? (
                receivedRequests.map(
                  (request) => (
                    <div
                      key={request.id}
                    >
                      <div>
                        <b>
                          {request.from} →{" "}
                          {profile.name}
                        </b>

                        <small>
                          {
                            request.incidentTitle
                          }{" "}
                          · Priority:{" "}
                          {
                            request.priority
                          }{" "}
                          ·{" "}
                          {
                            request.createdAt
                          }
                        </small>

                        <p>
                          {request.help}
                        </p>

                        <em>
                          {
                            request.currentAction
                          }
                        </em>
                      </div>

                      <StatusTag
                        status={
                          request.status
                        }
                      />
                    </div>
                  )
                )
              ) : (
                <p className="muted-copy">
                  No received
                  requests.
                </p>
              )}
            </div>
          </section>

          <section>
            <h3>SENT</h3>

            <div className="coordination-list">
              {sentRequests.length ? (
                sentRequests.map(
                  (request) => (
                    <div
                      key={request.id}
                    >
                      <div>
                        <b>
                          {profile.name} →{" "}
                          {request.to}
                        </b>

                        <small>
                          {
                            request.incidentTitle
                          }{" "}
                          · Priority:{" "}
                          {
                            request.priority
                          }{" "}
                          ·{" "}
                          {
                            request.createdAt
                          }
                        </small>

                        <p>
                          {request.help}
                        </p>

                        <em>
                          {
                            request.currentAction
                          }
                        </em>
                      </div>

                      <StatusTag
                        status={
                          request.status
                        }
                      />
                    </div>
                  )
                )
              ) : (
                <p className="muted-copy">
                  No sent requests.
                </p>
              )}
            </div>
          </section>
        </div>
      </Panel>

      <div className="assistance-bar">
        <div>
          <span className="eyebrow">
            CROSS-AGENCY SUPPORT
          </span>

          <b>
            Need another department at
            the incident?
          </b>
        </div>

        <button
          className="button button-primary"
          onClick={() => {
            setConfirmation(false);
            setAssistanceOpen(true);
          }}
        >
          REQUEST ASSISTANCE
        </button>
      </div>

      {confirmation && (
        <div className="request-confirmation">
          Assistance request submitted
          and added to Coordination
          Requests with Pending status.
        </div>
      )}

      {assistanceOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
        >
          <div
            className="assistance-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistance-title"
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  COORDINATION REQUEST
                </span>

                <h2 id="assistance-title">
                  Request assistance
                </h2>
              </div>

              <button
                className="drawer-close"
                onClick={() =>
                  setAssistanceOpen(
                    false
                  )
                }
                aria-label="Close request form"
              >
                ×
              </button>
            </div>

            <div className="assistance-form">
              <label>
                Request assistance from

                <select
                  value={requestTo}
                  onChange={(event) =>
                    setRequestTo(
                      event.target.value
                    )
                  }
                >
                  {[
                    "Fire Department",
                    "Traffic Department",
                    "Police Department",
                    "Medical Department",
                    "Electricity Department",
                    "Water Department",
                    "Infrastructure Department",
                  ]
                    .filter(
                      (
                        department
                      ) =>
                        department !==
                        profile.name
                    )
                    .map(
                      (
                        department
                      ) => (
                        <option
                          key={
                            department
                          }
                        >
                          {
                            department
                          }
                        </option>
                      )
                    )}
                </select>
              </label>

              <label>
                Incident

                <select
                  value={
                    requestIncidentId
                  }
                  onChange={(event) =>
                    setRequestIncidentId(
                      event.target.value
                    )
                  }
                >
                  {incidents.map(
                    (incident) => (
                      <option
                        value={
                          incident.id
                        }
                        key={
                          incident.id
                        }
                      >
                        {
                          incident.title
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Priority

                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(
                      event.target.value
                    )
                  }
                >
                  {[
                    "Critical",
                    "High",
                    "Medium",
                    "Low",
                  ].map(
                    (level) => (
                      <option
                        key={level}
                      >
                        {level}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Help required

                <textarea
                  value={help}
                  onChange={(event) =>
                    setHelp(
                      event.target.value
                    )
                  }
                  placeholder="Describe the support needed at this incident."
                  rows={4}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() =>
                  setAssistanceOpen(
                    false
                  )
                }
              >
                CANCEL
              </button>

              <button
                className="button button-primary"
                onClick={
                  submitRequest
                }
                disabled={
                  !help.trim() ||
                  !requestTo ||
                  !requestIncidentId ||
                  !priority
                }
              >
                SEND REQUEST
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Simulator() {
  const [
    intervention,
    setIntervention,
  ] = useState(true);

  return (
    <>
      <div className="simulator-toggle">
        <span>
          <b>
            Scenario: Building A Fire
          </b>

          <small>
            Model horizon: 30 minutes ·
            Current conditions
          </small>
        </span>

        <div className="toggle-group">
          <button
            className={
              !intervention
                ? "active"
                : ""
            }
            onClick={() =>
              setIntervention(false)
            }
          >
            WITHOUT INTERVENTION
          </button>

          <button
            className={
              intervention
                ? "active"
                : ""
            }
            onClick={() =>
              setIntervention(true)
            }
          >
            WITH RECOMMENDED ACTIONS
          </button>
        </div>
      </div>

      <div className="scenario-grid">
        <ScenarioCard
          title="Affected assets"
          value={
            intervention
              ? "04"
              : "11"
          }
          detail={
            intervention
              ? "3 fewer assets exposed"
              : "Escalation across 4 systems"
          }
          tone={
            intervention
              ? "good"
              : "bad"
          }
        />

        <ScenarioCard
          title="Cascading impacts"
          value={
            intervention
              ? "02"
              : "07"
          }
          detail={
            intervention
              ? "Contained to primary zone"
              : "Multi-network propagation"
          }
          tone={
            intervention
              ? "good"
              : "bad"
          }
        />

        <ScenarioCard
          title="Infrastructure risk"
          value={
            intervention
              ? "31%"
              : "78%"
          }
          detail={
            intervention
              ? "Reduced from baseline"
              : "Critical threshold exceeded"
          }
          tone={
            intervention
              ? "good"
              : "bad"
          }
        />

        <ScenarioCard
          title="Response delay"
          value={
            intervention
              ? "08 min"
              : "24 min"
          }
          detail={
            intervention
              ? "Within service target"
              : "Target breached"
          }
          tone={
            intervention
              ? "good"
              : "bad"
          }
        />
      </div>

      <Panel
        title="Projected outcome"
        eyebrow={
          intervention
            ? "RECOMMENDED PATH"
            : "BASELINE PATH"
        }
      >
        <div className="outcome-bar">
          <div
            className={
              intervention
                ? "outcome-active"
                : ""
            }
          >
            <b>WITH ACTIONS</b>

            <span
              style={{
                width: "31%",
              }}
            />
          </div>

          <div
            className={
              !intervention
                ? "outcome-active"
                : ""
            }
          >
            <b>
              WITHOUT ACTIONS
            </b>

            <span
              style={{
                width: "78%",
              }}
            />
          </div>
        </div>

        <p className="muted-copy">
          {intervention
            ? "Pre-isolating T4 and activating the R12 diversion contains the event within the eastern response zone. No hospital service disruption is projected."
            : "Without coordinated intervention, the fire reaches the transformer corridor, causing utility disruption and compounding ambulance access delays."}
        </p>
      </Panel>
    </>
  );
}

function ScenarioCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div
      className={`scenario-card ${tone}`}
    >
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function History() {
  const [query, setQuery] = useState("");
  const [incidentId, setIncidentId] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [severity, setSeverity] = useState("ALL");
  const [date, setDate] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [exportMessage, setExportMessage] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const records = historicalIncidents.filter((item) => {
    const matchesQuery = !normalizedQuery || [item.id, item.title, item.type, item.location]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
    return matchesQuery &&
      (incidentId === "ALL" || item.id === incidentId) &&
      (type === "ALL" || item.type === type) &&
      (severity === "ALL" || item.severity === severity) &&
      (date === "ALL" || item.date === date) &&
      (status === "ALL" || item.status === status);
  });

  const resetFilters = () => {
    setQuery("");
    setIncidentId("ALL");
    setType("ALL");
    setSeverity("ALL");
    setDate("ALL");
    setStatus("ALL");
    setExportMessage("");
  };

  const exportCsv = () => {
    const headers = ["Reference", "Incident", "Type", "Location", "Date", "Duration", "Severity", "Status", "Outcome"];
    const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = records.map((item) => [item.id, item.title, item.type, item.location, item.date, item.duration, item.severity, item.status, item.outcome]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "nirikshak-incident-history.csv";
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage("CSV exported successfully.");
  };

  return (
    <Panel
      title="Incident archive"
      eyebrow={`${historicalIncidents.length} RECORDS`}
    >
      <div className="history-toolbar">
        <label className="search-field">
          ⌕

          <input
            placeholder="Search incidents, types or locations"
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value
              )
            }
          />
        </label>

        <select value={incidentId} onChange={(event) => setIncidentId(event.target.value)}>
          <option value="ALL">All incidents</option>
          {historicalIncidents.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.title}</option>)}
        </select>

        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="ALL">All incident types</option>
          {[...new Set(historicalIncidents.map((item) => item.type))].map((item) => <option value={item} key={item}>{item}</option>)}
        </select>

        <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
          <option value="ALL">All severities</option>
          {[...new Set(historicalIncidents.map((item) => item.severity))].map((item) => <option value={item} key={item}>{item}</option>)}
        </select>

        <select value={date} onChange={(event) => setDate(event.target.value)}>
          <option value="ALL">All dates</option>
          {[...new Set(historicalIncidents.map((item) => item.date))].map((item) => <option value={item} key={item}>{item}</option>)}
        </select>

        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ALL">All statuses</option>
          {[...new Set(historicalIncidents.map((item) => item.status))].map((item) => <option value={item} key={item}>{item}</option>)}
        </select>

        <button className="button button-secondary" onClick={resetFilters}>
          Clear filters
        </button>

        <button className="button button-secondary" onClick={exportCsv}>
          Export CSV ↓
        </button>
      </div>

      <div className="history-result-count">Showing {records.length} of {historicalIncidents.length} incidents{exportMessage && <span>{exportMessage}</span>}</div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Incident</th>
              <th>Type</th>
              <th>Location</th>
              <th>Date</th>
              <th>Duration</th>
              <th>Outcome</th>
            </tr>
          </thead>

          <tbody>
            {records.map(
              (item) => (
                <tr key={item.id}>
                  <td>
                    <b>{item.id}</b>
                  </td>

                  <td>
                    {item.title}
                  </td>

                  <td>
                    {item.type}
                  </td>

                  <td>
                    {item.location}
                  </td>

                  <td>
                    {item.date}
                  </td>

                  <td>
                    {item.duration}
                  </td>

                  <td>
                    <StatusTag
                      status={
                        item.status
                      }
                    />
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      {!records.length && <p className="muted-copy">No incidents match the selected filters.</p>}
    </Panel>
  );
}

function SettingsPage() {
  const [
    preferences,
    setPreferences,
  ] = useState(loadPreferences);

  const [saved, setSaved] =
    useState(false);

  const update = (
    key: keyof Preferences,
    value: boolean
  ) => {
    const next = {
      ...preferences,
      [key]: value,
    };

    setPreferences(next);
    savePreferences(next);
    setSaved(false);
  };

  const save = () => {
    savePreferences(
      preferences
    );

    setSaved(true);
  };

  const healthCheck =
    new Intl.DateTimeFormat(
      "en-IN",
      {
        timeZone:
          MAP_CONFIG.timezone,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }
    ).format(new Date());

  return (
    <div
      className={`settings-layout ${
        preferences.compactDataDensity
          ? "compact-density"
          : ""
      }`}
    >
      <Panel
        title="Control room preferences"
        eyebrow="LOCAL SESSION"
      >
        <div className="settings-row">
          <div>
            <b>
              Live incident
              notifications
            </b>

            <small>
              Receive priority alerts
              from all connected
              departments.
            </small>
          </div>

          <button
            className={`switch ${
              preferences.liveIncidentNotifications
                ? "on"
                : ""
            }`}
            aria-pressed={
              preferences.liveIncidentNotifications
            }
            onClick={() =>
              update(
                "liveIncidentNotifications",
                !preferences.liveIncidentNotifications
              )
            }
          >
            <i />
          </button>
        </div>

        <div className="settings-row">
          <div>
            <b>
              Sound alerts for
              critical events
            </b>

            <small>
              Allow critical-event
              sound alerts when
              supported by the browser.
            </small>
          </div>

          <button
            className={`switch ${
              preferences.soundAlerts
                ? "on"
                : ""
            }`}
            aria-pressed={
              preferences.soundAlerts
            }
            onClick={() =>
              update(
                "soundAlerts",
                !preferences.soundAlerts
              )
            }
          >
            <i />
          </button>
        </div>

        <div className="settings-row">
          <div>
            <b>
              Compact data density
            </b>

            <small>
              Show more rows in
              operational tables and
              lists.
            </small>
          </div>

          <button
            className={`switch ${
              preferences.compactDataDensity
                ? "on"
                : ""
            }`}
            aria-pressed={
              preferences.compactDataDensity
            }
            onClick={() =>
              update(
                "compactDataDensity",
                !preferences.compactDataDensity
              )
            }
          >
            <i />
          </button>
        </div>

        <div className="settings-row">
          <div>
            <b>
              Map auto-refresh
            </b>

            <small>
              Refresh map-related mock
              data and view state every
              30 seconds.
            </small>
          </div>

          <button
            className={`switch ${
              preferences.mapAutoRefresh
                ? "on"
                : ""
            }`}
            aria-pressed={
              preferences.mapAutoRefresh
            }
            onClick={() =>
              update(
                "mapAutoRefresh",
                !preferences.mapAutoRefresh
              )
            }
          >
            <i />
          </button>
        </div>
      </Panel>

      <Panel
        title="Display"
        eyebrow="SYSTEM CONFIGURATION"
      >
        <div className="form-grid">
          <label>
            Time zone

            <select
              value={
                MAP_CONFIG.timezoneLabel
              }
              disabled
            >
              <option>
                {
                  MAP_CONFIG.timezoneLabel
                }
              </option>
            </select>
          </label>

          <label>
            Default map layer

            <select
              value={
                preferences.defaultMapLayer
              }
              onChange={(event) => {
                const next = {
                  ...preferences,
                  defaultMapLayer:
                    event.target
                      .value as Preferences["defaultMapLayer"],
                };

                setPreferences(
                  next
                );

                savePreferences(
                  next
                );
              }}
            >
              <option value="operational">
                Operational overview
              </option>

              <option value="satellite">
                Satellite imagery
              </option>
            </select>
          </label>

          <label>
            Units

            <select defaultValue="metric">
              <option value="metric">
                Metric (km / min)
              </option>
            </select>
          </label>
        </div>

        <button
          className="button button-primary"
          onClick={save}
        >
          {saved
            ? "Preferences saved"
            : "Save preferences"}
        </button>
      </Panel>

      <Panel
        title="System information"
        eyebrow="NIRIKSHAK PLATFORM"
      >
        <InfoRows
          rows={[
            [
              "Application",
              "NIRIKSHAK Command Center",
            ],
            [
              "Build",
              "2.4.1 · Operations release",
            ],
            [
              "Data mode",
              "Local demonstration data",
            ],
            [
              "Last health check",
              `${healthCheck} IST`,
            ],
          ]}
        />
      </Panel>
    </div>
  );
}

export default App;

void Routing;
void CascadingEffects;
void LegacyRouting;