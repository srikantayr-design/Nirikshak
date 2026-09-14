export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type Asset = {
  id: string;
  name: string;
  type: string;
  status: string;
  detail: string;
  x: number;
  y: number;
  lat?: number;
  lng?: number;
  criticality?: Severity;
  currentRisk?: number;
  connectedAssets?: string[];
  potentialConsequence?: string;
};

export type MonitoredLocation = {
  id: string;
  name: string;
  type: string;
  risk: Severity;
  riskScore: number;
  density: string;
  vulnerability: string[];
  nearbyAssetIds: string[];
  lastAnalyzed: string;
  lat: number;
  lng: number;
  scenarios: Record<string, {
    primary: string;
    secondary: string[];
    tertiary: string[];
    confidence: number;
    severity: Severity;
    departments: { name: string; action: string }[];
    recommendations: string[];
  }>;
};

export type ResponseUnit = { id: string; name: string; department: string; baseAssetId: string; status: "AVAILABLE" | "BUSY" | "DEPLOYED" };
export type RouteGeometry = { type: "LineString"; coordinates: [number, number][] };
export type RouteOption = { id: string; name: string; distance: string; eta: string; risk: string; blockage: string; traffic: string; hazard: string; explanation: string; offset: number; geometry?: RouteGeometry; routeRank?: number; recommended?: boolean };
export type ResponseProfile = { targetAssetId: string; units: ResponseUnit[]; routes: RouteOption[] };

export type CascadeNode = {
  name: string;
  type: string;
  detail: string;
  risk: number;
  onset: string;
};

export type CascadeBranch = { label: string; nodes: CascadeNode[] };

export type Incident = {
  id: string;
  databaseId?: string;
  title: string;
  type: string;
  severity: Severity;
  status: string;
  location: string;
  locationCoordinates?: { lat: number; lng: number };
  time: string;
  detectionTime: string;
  confidence: number;
  affectedInfrastructure: string[];
  currentImpacts: string;
  predictedImpacts: string;
  impactDetails?: {
    assetName: string;
    impactState: "current" | "predicted";
    impactType: string;
    severity: string | null;
    likelihood: number | null;
    description: string;
  }[];
  cascadeSummary: string;
  recommendedActions: { text: string; meta: string }[];
  responsibleDepartments: string[];
  assets: Asset[];
  cascade: {
    primaryEvent: string;
    escalationProbability: number;
    highestRiskAsset: string;
    branches: CascadeBranch[];
  };
};

export type HistoricalIncident = {
  id: string;
  title: string;
  type: string;
  location: string;
  date: string;
  duration: string;
  outcome: string;
  severity: Severity;
  status: string;
};

const node = (name: string, type: string, detail: string, risk: number, onset: string): CascadeNode => ({ name, type, detail, risk, onset });
const asset = (id: string, name: string, type: string, status: string, detail: string, x: number, y: number): Asset => ({ id, name, type, status, detail, x, y });

export const infrastructureAssets: Asset[] = [
  { ...asset("B-A", "Building A", "BUILDING", "AT RISK", "Commercial high-rise, 8 floors. Fire origin confirmed on floor 3.", 53, 40), lat: 12.9718, lng: 77.6412, criticality: "HIGH", currentRisk: 82, connectedAssets: ["R12", "T4", "H1"], potentialConsequence: "Structural damage could block the east response corridor." },
  { ...asset("R12", "Road R12", "ROAD", "BLOCKED", "Primary east-west corridor. Northbound lane blocked by emergency cordon.", 38, 59), lat: 12.9728, lng: 77.6384, criticality: "HIGH", currentRisk: 71, connectedAssets: ["B-A", "F03", "H1"], potentialConsequence: "Closure could delay fire and ambulance access." },
  { ...asset("T4", "Transformer T4", "ELECTRICITY", "AT RISK", "11 kV distribution transformer serving the east sector.", 67, 31), lat: 12.9744, lng: 77.6444, criticality: "HIGH", currentRisk: 72, connectedAssets: ["W2", "B-A", "H1"], potentialConsequence: "Loss of supply could disrupt water pumping and hospital backup systems." },
  { ...asset("W2", "Water Pump W2", "WATER", "MONITORING", "Booster pump supplying the east pressure zone.", 75, 65), lat: 12.9683, lng: 77.6448, criticality: "HIGH", currentRisk: 58, connectedAssets: ["T4", "H1"], potentialConsequence: "Unavailability could reduce pressure across the eastern distribution zone." },
  { ...asset("H1", "Hospital H1", "HOSPITAL", "SAFE", "St. Martha Emergency Hospital and ambulance receiving point.", 24, 28), lat: 12.9761, lng: 77.6358, criticality: "CRITICAL", currentRisk: 36, connectedAssets: ["R12", "T4", "W2"], potentialConsequence: "Access or utility disruption could affect emergency intake." },
  { ...asset("F03", "Fire Station F03", "FIRE STATION", "DEPLOYED", "East-sector fire station with rapid response units.", 19, 70), lat: 12.9679, lng: 77.6364, criticality: "HIGH", currentRisk: 44, connectedAssets: ["R12", "B-A"], potentialConsequence: "Route obstruction could lengthen fire response times." },
  { ...asset("P02", "Police Station P02", "POLICE", "OPERATIONAL", "East division police station coordinating traffic control.", 42, 22), lat: 12.9778, lng: 77.6394, criticality: "MEDIUM", currentRisk: 28, connectedAssets: ["R12", "F03"], potentialConsequence: "Reduced staffing could slow diversion and perimeter control." },
  { ...asset("ER1", "East Rescue Centre", "EMERGENCY CENTRE", "READY", "Multi-agency emergency coordination centre.", 59, 76), lat: 12.9667, lng: 77.6421, criticality: "HIGH", currentRisk: 32, connectedAssets: ["F03", "H1", "R12"], potentialConsequence: "Loss of coordination could fragment multi-department response." },
  { ...asset("EB1", "East Grid Maintenance Base", "ELECTRICITY", "OPERATIONAL", "Electrical maintenance depot for east-sector grid crews.", 79, 22), lat: 12.9771, lng: 77.6462, criticality: "HIGH", currentRisk: 24, connectedAssets: ["T4", "ER1"], potentialConsequence: "Reduced maintenance readiness could extend a feeder outage." },
];

export const responseProfiles: Record<string, ResponseProfile> = {
  "INC-2407": { targetAssetId: "B-A", units: [{ id: "F03", name: "Fire Unit F03", department: "Fire Department", baseAssetId: "F03", status: "AVAILABLE" }, { id: "F04", name: "Fire Unit F04", department: "Fire Department", baseAssetId: "F03", status: "BUSY" }], routes: [{ id: "route-b", name: "Route B", distance: "4.8 km", eta: "7 min", risk: "LOW", blockage: "12%", traffic: "Moderate", hazard: "Low smoke exposure", explanation: "Route B is recommended because it avoids the high blockage risk on Road R12 while keeping the shortest clear approach to Building A.", offset: 0 }, { id: "route-a", name: "Route A", distance: "4.2 km", eta: "6 min", risk: "HIGH", blockage: "46%", traffic: "Heavy", hazard: "Fire cordon exposure", explanation: "Route A is shorter on paper but crosses the active Road R12 blockage and the fire cordon.", offset: 0.0008 }, { id: "route-c", name: "Route C", distance: "6.1 km", eta: "10 min", risk: "LOW", blockage: "8%", traffic: "Light", hazard: "Longer approach", explanation: "Route C is the safest alternative but adds distance through the southern access road.", offset: -0.0008 }] },
  "INC-2406": { targetAssetId: "T4", units: [{ id: "E12", name: "Grid Crew E12", department: "Electricity Department", baseAssetId: "EB1", status: "AVAILABLE" }, { id: "E18", name: "Grid Crew E18", department: "Electricity Department", baseAssetId: "ER1", status: "DEPLOYED" }], routes: [{ id: "route-grid", name: "Feeder Service Route", distance: "3.1 km", eta: "9 min", risk: "MEDIUM", blockage: "18%", traffic: "Moderate", hazard: "Live electrical equipment", explanation: "The feeder service route keeps the crew on the eastern utility corridor and avoids the hospital approach.", offset: 0 }, { id: "route-grid-alt", name: "Ring Road Alternative", distance: "4.6 km", eta: "12 min", risk: "LOW", blockage: "9%", traffic: "Light", hazard: "Longer utility access", explanation: "The ring road is less exposed but adds 3 minutes to the transformer response.", offset: 0.0008 }] },
  "INC-2405": { targetAssetId: "R12", units: [{ id: "T05", name: "Traffic Unit T05", department: "Traffic Department", baseAssetId: "P02", status: "AVAILABLE" }, { id: "T08", name: "Recovery Unit T08", department: "Traffic Department", baseAssetId: "ER1", status: "BUSY" }], routes: [{ id: "route-traffic", name: "East Junction Approach", distance: "2.7 km", eta: "6 min", risk: "HIGH", blockage: "54%", traffic: "Severe", hazard: "Queue spillback", explanation: "The recommended approach uses the police station side of the corridor and avoids the blocked northbound lane.", offset: 0 }, { id: "route-traffic-alt", name: "12th Main Diversion", distance: "4.1 km", eta: "9 min", risk: "LOW", blockage: "14%", traffic: "Moderate", hazard: "Clear diversion", explanation: "The diversion is slower but provides a reliable recovery path around the R12 obstruction.", offset: 0.0008 }] },
  "INC-2404": { targetAssetId: "W2", units: [{ id: "W07", name: "Water Crew W07", department: "Water & Sewerage", baseAssetId: "ER1", status: "AVAILABLE" }, { id: "W11", name: "Pump Technician W11", department: "Water & Sewerage", baseAssetId: "W2", status: "BUSY" }], routes: [{ id: "route-water", name: "Domlur Service Route", distance: "3.8 km", eta: "11 min", risk: "MEDIUM", blockage: "21%", traffic: "Moderate", hazard: "Low water pressure", explanation: "The service route reaches W2 directly while avoiding the busiest junction near the pressure-drop zone.", offset: 0 }, { id: "route-water-alt", name: "Southern Utility Route", distance: "5.2 km", eta: "15 min", risk: "LOW", blockage: "10%", traffic: "Light", hazard: "Longer access", explanation: "The southern utility route has lower congestion but requires a longer approach to the pump.", offset: -0.0008 }] },
};

export const monitoredLocations: MonitoredLocation[] = [
  { id: "LOC-A", name: "Industrial Zone A", type: "INDUSTRIAL AREA", risk: "HIGH", riskScore: 82, density: "Very high", vulnerability: ["High infrastructure density", "Major transportation corridor nearby", "Electrical infrastructure nearby", "Limited alternative emergency routes"], nearbyAssetIds: ["T4", "W2", "R12", "B-A"], lastAnalyzed: "4 min ago", lat: 12.9726, lng: 77.6418, scenarios: {
    FIRE: { primary: "Major industrial fire", secondary: ["Road R12 blockage", "Transformer T4 exposure"], tertiary: ["Traffic congestion", "Power disruption", "Water pump disruption", "Hospital response delay"], confidence: 84, severity: "CRITICAL", departments: [{ name: "Fire Department", action: "Fire suppression" }, { name: "Traffic Department", action: "Road closure and diversion" }, { name: "Electricity Department", action: "Transformer inspection and isolation" }, { name: "Medical Department", action: "Hospital preparedness" }], recommendations: ["Predefine an alternate emergency route", "Inspect electrical infrastructure", "Verify nearby fire hydrant and water availability", "Increase monitoring priority"] },
    "STRUCTURAL COLLAPSE": { primary: "Structural collapse", secondary: ["Building A debris field", "Road R12 obstruction"], tertiary: ["Emergency access delay", "Utility line exposure", "Evacuation pressure at H1"], confidence: 76, severity: "CRITICAL", departments: [{ name: "Infrastructure Department", action: "Structural assessment" }, { name: "Fire Department", action: "Search and rescue" }, { name: "Traffic Department", action: "Secure the corridor" }], recommendations: ["Pre-stage structural rescue equipment", "Mark a clear evacuation assembly area", "Review alternate routes"] },
    FLOOD: { primary: "Flash flooding", secondary: ["Road R12 inundation", "Water Pump W2 overload"], tertiary: ["Traffic diversion", "Electrical isolation", "Hospital access delay"], confidence: 71, severity: "HIGH", departments: [{ name: "Water Department", action: "Drainage and pump response" }, { name: "Traffic Department", action: "Flood closure and diversion" }, { name: "Medical Department", action: "Protect hospital access" }], recommendations: ["Clear storm drains before heavy rain", "Verify pump backup power", "Predefine a dry emergency route"] },
    "INDUSTRIAL ACCIDENT": { primary: "Industrial accident", secondary: ["Hazardous material perimeter", "Road R12 closure"], tertiary: ["Smoke exposure", "Water contamination concern", "Emergency response delay"], confidence: 79, severity: "HIGH", departments: [{ name: "Fire Department", action: "Hazard containment" }, { name: "Police Department", action: "Perimeter control" }, { name: "Water Department", action: "Protect supply network" }], recommendations: ["Review hazardous-material access plans", "Keep a two-way emergency corridor clear", "Inspect water isolation valves"] },
    "ELECTRICAL FAILURE": { primary: "Electrical failure", secondary: ["Transformer T4 trip", "Water Pump W2 disruption"], tertiary: ["Water pressure loss", "Hospital backup generation", "Traffic signal outage"], confidence: 88, severity: "HIGH", departments: [{ name: "Electricity Department", action: "Load transfer and isolation" }, { name: "Water Department", action: "Maintain pump continuity" }, { name: "Medical Department", action: "Test hospital backup power" }], recommendations: ["Transfer load before peak demand", "Test generator fuel reserves", "Maintain manual traffic control plan"] }
  } },
  { id: "LOC-B", name: "Commercial District B", type: "COMMERCIAL DISTRICT", risk: "MEDIUM", riskScore: 61, density: "High", vulnerability: ["Dense pedestrian activity", "Hospital access depends on one intersection", "Limited staging space"], nearbyAssetIds: ["H1", "P02", "R12"], lastAnalyzed: "11 min ago", lat: 12.9760, lng: 77.6375, scenarios: {
    FIRE: { primary: "Commercial building fire", secondary: ["Major intersection closure", "Hospital access pressure"], tertiary: ["Pedestrian displacement", "Ambulance delay", "Traffic diversion"], confidence: 81, severity: "HIGH", departments: [{ name: "Fire Department", action: "Suppression and evacuation" }, { name: "Traffic Department", action: "Intersection control" }, { name: "Medical Department", action: "Hospital intake readiness" }], recommendations: ["Keep the hospital approach clear", "Run a quarterly evacuation drill", "Stage portable barriers"] },
    "STRUCTURAL COLLAPSE": { primary: "Commercial structure collapse", secondary: ["Debris at major intersection", "Hospital access restriction"], tertiary: ["Crowd displacement", "Search and rescue demand", "Ambulance rerouting"], confidence: 73, severity: "HIGH", departments: [{ name: "Infrastructure Department", action: "Building safety inspection" }, { name: "Fire Department", action: "Rescue operations" }, { name: "Traffic Department", action: "Pedestrian and road control" }], recommendations: ["Pre-identify assembly areas", "Audit older commercial facades", "Maintain a rescue staging point"] },
    FLOOD: { primary: "District flooding", secondary: ["Intersection inundation", "Hospital access reduction"], tertiary: ["Pedestrian isolation", "Traffic diversion", "Clinic service disruption"], confidence: 68, severity: "MEDIUM", departments: [{ name: "Water Department", action: "Drainage response" }, { name: "Traffic Department", action: "Safe diversion" }, { name: "Medical Department", action: "Protect patient access" }], recommendations: ["Inspect drains before monsoon alerts", "Mark high-ground staging areas", "Coordinate hospital access protocol"] },
    "INDUSTRIAL ACCIDENT": { primary: "Commercial hazardous release", secondary: ["Public exclusion zone", "Hospital decontamination demand"], tertiary: ["Pedestrian evacuation", "Traffic diversion", "Emergency intake pressure"], confidence: 65, severity: "HIGH", departments: [{ name: "Fire Department", action: "Hazard assessment" }, { name: "Police Department", action: "Public exclusion" }, { name: "Medical Department", action: "Decontamination readiness" }], recommendations: ["Review public alerting", "Maintain clear hospital approach", "Exercise multi-agency shelter plan"] },
    "ELECTRICAL FAILURE": { primary: "District power failure", secondary: ["Traffic signal outage", "Hospital backup activation"], tertiary: ["Intersection congestion", "Elevator outages", "Emergency response delay"], confidence: 83, severity: "MEDIUM", departments: [{ name: "Electricity Department", action: "Feeder restoration" }, { name: "Traffic Department", action: "Manual junction control" }, { name: "Medical Department", action: "Backup power monitoring" }], recommendations: ["Test critical building generators", "Prepare manual signal control", "Confirm hospital fuel reserves"] }
  } },
  { id: "LOC-C", name: "Transport Corridor C", type: "TRANSPORT CORRIDOR", risk: "HIGH", riskScore: 75, density: "High", vulnerability: ["Single emergency route", "Fuel infrastructure nearby", "High peak-hour traffic volume"], nearbyAssetIds: ["R12", "F03", "ER1"], lastAnalyzed: "8 min ago", lat: 12.9688, lng: 77.6388, scenarios: {
    FIRE: { primary: "Fuel-adjacent corridor fire", secondary: ["Road R12 closure", "Emergency centre exposure"], tertiary: ["Traffic gridlock", "Fire station route delay", "Regional response degradation"], confidence: 86, severity: "CRITICAL", departments: [{ name: "Fire Department", action: "Fuel hazard suppression" }, { name: "Traffic Department", action: "Full corridor diversion" }, { name: "Emergency Centre", action: "Coordinate regional response" }], recommendations: ["Protect a dedicated emergency lane", "Inspect fuel separation distances", "Stage a recovery vehicle nearby"] },
    "STRUCTURAL COLLAPSE": { primary: "Bridge or corridor collapse", secondary: ["Road R12 severance", "Fire station isolation"], tertiary: ["Regional traffic diversion", "Rescue access delay", "Emergency centre congestion"], confidence: 74, severity: "CRITICAL", departments: [{ name: "Infrastructure Department", action: "Route and bridge assessment" }, { name: "Fire Department", action: "Rescue access" }, { name: "Traffic Department", action: "Regional diversion" }], recommendations: ["Inspect corridor structures", "Map alternate response routes", "Pre-stage rescue signage"] },
    FLOOD: { primary: "Corridor flooding", secondary: ["Road R12 inundation", "Emergency route loss"], tertiary: ["Fuel access restriction", "Fire station delay", "Regional congestion"], confidence: 78, severity: "HIGH", departments: [{ name: "Water Department", action: "Drainage clearance" }, { name: "Traffic Department", action: "Flood diversion" }, { name: "Fire Department", action: "Protect response access" }], recommendations: ["Verify flood depth signage", "Keep an alternate route clear", "Inspect culverts and drains"] },
    "INDUSTRIAL ACCIDENT": { primary: "Transport fuel incident", secondary: ["Hazard perimeter", "Emergency route closure"], tertiary: ["Regional traffic diversion", "Smoke exposure", "Rescue coordination load"], confidence: 82, severity: "CRITICAL", departments: [{ name: "Fire Department", action: "Hazardous incident control" }, { name: "Police Department", action: "Corridor closure" }, { name: "Emergency Centre", action: "Regional coordination" }], recommendations: ["Review fuel incident plan", "Keep recovery equipment ready", "Run a corridor evacuation exercise"] },
    "ELECTRICAL FAILURE": { primary: "Corridor power failure", secondary: ["Traffic signal outage", "Emergency centre continuity risk"], tertiary: ["Junction congestion", "Route marking loss", "Dispatch delay"], confidence: 80, severity: "HIGH", departments: [{ name: "Electricity Department", action: "Restore corridor feeder" }, { name: "Traffic Department", action: "Manual signal operation" }, { name: "Emergency Centre", action: "Maintain coordination" }], recommendations: ["Test emergency centre generator", "Keep portable signal kits ready", "Map power-independent routes"] }
  } },
];

export const incidents: Incident[] = [
  {
    id: "INC-2407", title: "Building A Fire", type: "STRUCTURAL FIRE", severity: "CRITICAL", status: "ACTIVE", location: "Indiranagar, Sector 4", time: "2 min ago", detectionTime: "10 Sep 2026 · 14:30 IST", confidence: 94,
    affectedInfrastructure: ["Building A", "Road R12", "Transformer T4", "Hospital H1"],
    currentImpacts: "Smoke plume affects a 400m radius; two adjacent structures are exposed and 36 people have been evacuated.",
    predictedImpacts: "Without intervention, heat may reach Transformer T4 in 18 minutes and delay ambulance arrivals by 8–14 minutes.",
    cascadeSummary: "Fire blocks Road R12, increasing congestion and degrading emergency access.",
    recommendedActions: [{ text: "Establish a 200m exclusion zone", meta: "Fire command · immediate" }, { text: "Reroute northbound traffic from Road R12", meta: "Traffic control · in progress" }, { text: "Pre-isolate Transformer T4", meta: "Electricity · recommended" }],
    responsibleDepartments: ["Fire & Emergency Services", "Traffic Police", "Electricity Board", "Medical Response"],
    assets: [asset("B-A", "Building A", "BUILDING", "AT RISK", "Commercial high-rise, 8 floors. Fire origin confirmed on floor 3.", 53, 40), asset("R12", "Road R12", "ROAD", "BLOCKED", "Primary east-west corridor. Northbound lane blocked by emergency cordon.", 38, 59), asset("T4", "Transformer T4", "ELECTRICITY", "AT RISK", "11 kV transformer. Thermal risk elevated by fire proximity.", 67, 31), asset("H1", "Hospital H1", "HOSPITAL", "SAFE", "St. Martha Emergency Hospital receiving diverted ambulances.", 24, 28)],
    cascade: { primaryEvent: "Fire", escalationProbability: 78, highestRiskAsset: "Transformer T4", branches: [{ label: "ACCESS & RESPONSE", nodes: [node("Fire", "ORIGIN", "Critical structural fire detected at 14:30 IST.", 94, "Now"), node("Road R12 blockage", "TRANSPORT", "Northbound lane closure creates a 12 minute access delay.", 71, "+8 min"), node("Traffic congestion", "EFFECT", "Traffic density projected to reach 78% above baseline.", 64, "+14 min"), node("Emergency response delay", "RISK", "Ambulance response may degrade by 8 to 14 minutes.", 58, "+18 min")] }, { label: "UTILITY & MEDICAL", nodes: [node("Fire", "ORIGIN", "Heat and smoke spread from Building A.", 94, "Now"), node("Transformer T4 exposure", "ELECTRICITY", "Thermal exposure is within 120m of the substation boundary.", 78, "+18 min"), node("Power disruption", "EFFECT", "Potential interruption to 2,400 connected consumers.", 49, "+25 min"), node("Hospital H1 diversion", "MEDICAL", "Emergency intake may need diversion.", 42, "+25 min")] }] }
  },
  {
    id: "INC-2406", title: "Transformer T4 Overload", type: "POWER GRID", severity: "HIGH", status: "MONITORING", location: "HAL 2nd Stage", time: "18 min ago", detectionTime: "10 Sep 2026 · 14:14 IST", confidence: 87,
    affectedInfrastructure: ["Transformer T4", "Water Pump W2", "Hospital H1"], currentImpacts: "T4 is operating above its safe thermal threshold and feeder voltage is fluctuating across the eastern grid.", predictedImpacts: "A protective trip could interrupt water pumping and put hospital backup generation under strain within 22 minutes.", cascadeSummary: "Overload trips the transformer, disrupts pumps, and creates a hospital continuity risk.",
    recommendedActions: [{ text: "Transfer 11 kV load to feeder T6", meta: "Electricity · immediate" }, { text: "Start standby generator checks at H1", meta: "Medical · prepare" }, { text: "Keep Water Pump W2 on priority supply", meta: "Water · monitor" }], responsibleDepartments: ["Electricity Board", "Water & Sewerage", "Medical Response"],
    assets: [asset("T4", "Transformer T4", "ELECTRICITY", "AT RISK", "11 kV transformer at 112% rated load; thermal alarm active.", 67, 31), asset("W2", "Water Pump W2", "WATER", "MONITORING", "Booster pump depends on the overloaded eastern feeder.", 75, 65), asset("H1", "Hospital H1", "HOSPITAL", "AT RISK", "Critical care wing has 18 minutes of battery reserve.", 24, 28)],
    cascade: { primaryEvent: "Power failure", escalationProbability: 61, highestRiskAsset: "Water Pump W2", branches: [{ label: "UTILITY CONTINUITY", nodes: [node("Power failure", "ORIGIN", "Transformer T4 overload may trigger a protective trip.", 87, "Now"), node("Water Pump W2 disruption", "WATER", "Booster pumping may stop on feeder isolation.", 61, "+10 min"), node("Water service impact", "EFFECT", "Eastern pressure zone could fall below service level.", 54, "+18 min"), node("Hospital operational risk", "MEDICAL", "H1 may rely on backup generation for critical care.", 43, "+22 min")] }, { label: "GRID STABILITY", nodes: [node("Power failure", "ORIGIN", "Thermal overload threatens the local feeder.", 87, "Now"), node("Feeder isolation", "ELECTRICITY", "Protective isolation may shift load to adjacent feeders.", 61, "+6 min"), node("Consumer interruption", "EFFECT", "Approximately 1,800 connections may lose supply.", 48, "+12 min")] }] }
  },
  {
    id: "INC-2405", title: "R12 Traffic Obstruction", type: "TRANSPORT", severity: "HIGH", status: "ACTIVE", location: "100 Feet Road, East", time: "31 min ago", detectionTime: "10 Sep 2026 · 14:01 IST", confidence: 98,
    affectedInfrastructure: ["Road R12", "Fire Station F03", "Hospital H1"], currentImpacts: "A disabled freight vehicle blocks the northbound lane, causing queues across the east junction and constraining emergency access.", predictedImpacts: "Congestion may spread to three junctions and add 17 minutes to emergency travel times during the next 20 minutes.", cascadeSummary: "Road obstruction diverts traffic, overloads nearby junctions, and delays emergency vehicles.",
    recommendedActions: [{ text: "Deploy heavy recovery vehicle", meta: "Traffic control · immediate" }, { text: "Activate the 12th Main diversion", meta: "Police · in progress" }, { text: "Reserve a clear emergency corridor", meta: "Fire services · coordinate" }], responsibleDepartments: ["Traffic Police", "Police", "Fire & Emergency Services"],
    assets: [asset("R12", "Road R12", "ROAD", "BLOCKED", "Northbound lane blocked by a disabled freight vehicle.", 38, 59), asset("F03", "Fire Station F03", "FIRE STATION", "MONITORING", "Dispatch route to the east sector is affected by queue spillback.", 19, 70), asset("H1", "Hospital H1", "HOSPITAL", "SAFE", "Ambulance access remains open but travel time is increasing.", 24, 28)],
    cascade: { primaryEvent: "Road obstruction", escalationProbability: 69, highestRiskAsset: "Fire Station F03", branches: [{ label: "TRAFFIC PROPAGATION", nodes: [node("Road obstruction", "ORIGIN", "Freight vehicle blocks the northbound lane on R12.", 98, "Now"), node("Traffic diversion", "TRANSPORT", "Vehicles reroute through 12th Main and East Junction.", 76, "+5 min"), node("Junction congestion", "EFFECT", "Queue spillback reaches three signalised junctions.", 69, "+12 min"), node("Emergency access delay", "RISK", "Response travel time may increase by 17 minutes.", 63, "+20 min")] }, { label: "RESPONSE NETWORK", nodes: [node("Road obstruction", "ORIGIN", "R12 capacity is reduced to one lane.", 98, "Now"), node("Fire Station F03 constraint", "FIRE", "East-sector dispatch route requires a protected corridor.", 73, "+8 min"), node("Hospital access pressure", "MEDICAL", "Ambulance turnaround time increases at H1.", 45, "+18 min")] }] }
  },
  {
    id: "INC-2404", title: "Water Main Pressure Drop", type: "WATER NETWORK", severity: "MEDIUM", status: "DISPATCHED", location: "Domlur Junction", time: "1 hr ago", detectionTime: "10 Sep 2026 · 13:32 IST", confidence: 91,
    affectedInfrastructure: ["Water Main M7", "Water Pump W2", "Domlur Clinic"], currentImpacts: "A pressure drop in main M7 is reducing supply to the eastern distribution zone; no contamination is detected.", predictedImpacts: "If the valve fault persists, upper floors and hydrants may lose reliable pressure over the next 45 minutes.", cascadeSummary: "Main pressure loss reduces local supply, weakens hydrants, and affects public health readiness.",
    recommendedActions: [{ text: "Isolate the M7 valve and inspect the joint", meta: "Water · dispatched" }, { text: "Place a tanker at Domlur Junction", meta: "Civic response · prepare" }, { text: "Verify fire hydrant pressure", meta: "Fire services · monitor" }], responsibleDepartments: ["Water & Sewerage", "Fire & Emergency Services", "Civic Response"],
    assets: [asset("M7", "Water Main M7", "WATER", "AT RISK", "Pressure sensor reports 42% below normal at the Domlur branch.", 75, 65), asset("W2", "Water Pump W2", "WATER", "MONITORING", "Pump is compensating for pressure loss on the eastern zone.", 61, 48), asset("DC1", "Domlur Clinic", "HOSPITAL", "SAFE", "Clinic has a six-hour stored water reserve.", 29, 36)],
    cascade: { primaryEvent: "Water main pressure drop", escalationProbability: 38, highestRiskAsset: "Water Main M7", branches: [{ label: "WATER SERVICE", nodes: [node("Pressure drop", "ORIGIN", "Main M7 pressure is 42% below normal.", 91, "Now"), node("Pump compensation", "WATER", "W2 increases output to stabilise the eastern zone.", 52, "+10 min"), node("Low water service", "EFFECT", "Upper floors may experience reduced supply.", 38, "+30 min"), node("Hydrant pressure risk", "RISK", "Fire hydrants may not meet response requirements.", 31, "+45 min")] }, { label: "PUBLIC READINESS", nodes: [node("Pressure drop", "ORIGIN", "A valve or joint fault is suspected on M7.", 91, "Now"), node("Tanker deployment", "CIVIC", "A temporary tanker point may be needed at Domlur.", 44, "+25 min"), node("Clinic reserve drawdown", "MEDICAL", "Domlur Clinic reserve covers current demand.", 22, "+45 min")] }] }
  }
];

export const historicalIncidents: HistoricalIncident[] = [
  { id: "INC-2398", title: "Warehouse smoke incident", type: "FIRE", location: "Whitefield Industrial Area", date: "08 SEP 2026", duration: "42 min", outcome: "Resolved", severity: "HIGH", status: "RESOLVED" },
  { id: "INC-2387", title: "Flash flooding - Koramangala", type: "FLOOD", location: "Koramangala 5th Block", date: "04 SEP 2026", duration: "3 hr 12 min", outcome: "Resolved", severity: "HIGH", status: "RESOLVED" },
  { id: "INC-2372", title: "Power line failure", type: "POWER", location: "East Bengaluru Grid", date: "29 AUG 2026", duration: "1 hr 08 min", outcome: "Resolved", severity: "MEDIUM", status: "RESOLVED" },
  { id: "INC-2361", title: "Multi-vehicle collision", type: "TRANSPORT", location: "Outer Ring Road", date: "24 AUG 2026", duration: "58 min", outcome: "Closed", severity: "HIGH", status: "CLOSED" },
];
