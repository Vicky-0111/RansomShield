// Demo-only adapter: all telemetry is generated locally in this browser.
// No backend, model, dataset, filesystem monitoring, or real endpoint protection is used.
let tick = 0;
let activeScenario = null;
let contained = false;
let incidentOpen = false;
let demoRunning = false;
let lastRun = null;

const nowIso = () => new Date().toISOString();
const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const featuresFor = (threat) => ({
  write_rate: threat ? 18 : 1.2,
  rename_rate: threat ? 12 : 0.3,
  delete_rate: threat ? 9 : 0.1,
  entropy_delta: threat ? 0.82 : 0.08,
  extension_change_rate: threat ? 11 : 0,
  burst_rate: threat ? 39 : 1.6,
  unique_paths: threat ? 24 : 2
});
function makeState() {
  tick++;
  const threat = Boolean(activeScenario);
  const score = threat ? Math.min(0.97, 0.79 + ((tick % 8) * 0.018)) : 0.035 + ((tick % 6) * 0.006);
  const features = featuresFor(threat);
  const events = threat ? [
    { id: "evt-104", timestamp: stamp(), type: "FILE_RENAME_BURST", endpoint: "LAB-LOCAL-001", process: "demo-simulator", detail: "Simulated rapid file-renaming pattern", severity: "HIGH", path: "lab-demo/sample-014.locked-demo", value: 12 },
    { id: "evt-103", timestamp: stamp(), type: "ENTROPY_DELTA", endpoint: "LAB-LOCAL-001", process: "demo-simulator", detail: "Synthetic entropy increase in sample files", severity: "MEDIUM", path: "lab-demo/sample-014.bin", value: 0.82 },
    { id: "evt-102", timestamp: stamp(), type: "WRITE_BURST", endpoint: "LAB-LOCAL-001", process: "demo-simulator", detail: "Synthetic write activity exceeded demonstration gate", severity: "HIGH", path: "lab-demo/", value: 18 },
  ] : [
    { id: "evt-101", timestamp: stamp(), type: "BENIGN_ACTIVITY", endpoint: "LAB-LOCAL-001", process: "demo-workload", detail: "Simulated low-volume benign file activity", severity: "LOW", path: "lab-demo/readme.txt", value: 2 }
  ];
  const incidents = incidentOpen ? [{
    id: "INC-DEMO-001", incident_id: "INC-DEMO-001", created_at: stamp(), updated_at: stamp(),
    status: contained ? "CONTAINED" : "OPEN", severity: "HIGH",
    title: "Simulated ransomware-like behaviour", summary: "Synthetic demo scenario only; no real ransomware was executed.",
    endpoint: "LAB-LOCAL-001", endpoint_id: "LAB-LOCAL-001", reason: "Demo scenario generated synthetic behavioural events."
  }] : [];
  return {
    mode: "SIMULATION_PREVIEW",
    generated_at: stamp(), generated_at_iso: nowIso(),
    endpoint_id: "LAB-LOCAL-001", window_seconds: 3, risk_threshold: 0.65, burst_gate_min: 8,
    incident_hold_seconds: 30, test_directory: "browser-only simulated lab",
    deployment_boundary: "DEMO ONLY — no live monitoring or endpoint actions",
    evaluations: tick, runs: activeScenario ? 1 : 0,
    detection: {
      evaluated: true, label: threat ? "RANSOMWARE_LIKE" : "BENIGN",
      score, probability: score, confidence: threat ? score : 1 - score,
      risk_level: threat ? "HIGH" : "LOW", decided_at: stamp(), decided_at_iso: nowIso(),
      window_seconds: 3, window_active: true, gate_open: threat,
      burst_rate: features.burst_rate, threshold: 0.65, burst_min: 8,
      features, feature_importance: [["write_rate", 0.25], ["rename_rate", 0.22], ["entropy_delta", 0.2], ["delete_rate", 0.14], ["burst_rate", 0.1], ["unique_paths", 0.06], ["extension_change_rate", 0.03]],
      metrics: {}, model: "Random Forest (not loaded in demo)", dataset_type: "browser-generated synthetic demo data",
      model_risk_level: threat ? "HIGH" : "LOW", gate_suppressed: false,
      incident_id: incidentOpen ? "INC-DEMO-001" : null,
      reason: threat ? "Synthetic scenario crossed the demo activity gate and threshold." : "Synthetic benign activity stayed below the demo threshold."
    },
    live_window: {
      sampled_at: stamp(), sampled_at_iso: nowIso(), live_score: score * 100,
      burst_rate: features.burst_rate, event_count: events.length, gate_open: threat,
      window_active: true, features
    },
    features,
    response: contained ? { status: "SIMULATED_CONTAINMENT", action: "SIMULATED_CONTAINMENT", endpoint_id: "LAB-LOCAL-001", created_at: stamp(), message: "Demo-only containment state recorded locally." } : null,
    incidents,
    endpoints: [{ id: "LAB-LOCAL-001", endpoint_id: "LAB-LOCAL-001", hostname: "LAB-LOCAL-001", name: "Local Demo Endpoint", status: contained ? "SIMULATED_ISOLATION" : "ONLINE", health: "ONLINE", last_seen: stamp(), platform: "Browser simulation" }],
    simulator: { running: demoRunning, pid: null, scenario: activeScenario, started_at: lastRun, finished_at: demoRunning ? null : stamp(), phase: demoRunning ? "synthetic_events" : "idle", phase_label: demoRunning ? "Generating synthetic events" : "Idle", phase_index: demoRunning ? 2 : 0, phase_total: demoRunning ? 4 : 0, stopping: false },
    sensor: { status: "ONLINE", healthy: true, thread_alive: true, scan_count: tick, error_count: 0, last_scan_age_seconds: 0, detail: "Browser-only synthetic telemetry" },
    model: { algorithm: "Demo-only synthetic scoring", metrics: { features: Object.keys(features) }, feature_importance: [["write_rate", 0.25], ["rename_rate", 0.22], ["entropy_delta", 0.2], ["delete_rate", 0.14], ["burst_rate", 0.1], ["unique_paths", 0.06], ["extension_change_rate", 0.03]], trained: false, source: "No model loaded" },
    events
  };
}
let current = makeState();
export const api = {
  base: "browser-only simulation",
  health: async () => ({ status: "ok", mode: "SIMULATION_PREVIEW", sensor: "SIMULATED" }),
  state: async () => { current = makeState(); return current; },
  model: async () => current.model,
  runWorkflow: async (scenario = "full_workflow") => {
    activeScenario = scenario; contained = false; incidentOpen = true; demoRunning = true; lastRun = stamp();
    current = makeState();
    setTimeout(() => { demoRunning = false; current = makeState(); }, 5000);
    return { message: `Simulation preview: generated synthetic ${scenario.replaceAll("_", " ")} events. No live detection was performed.` };
  },
  contain: async () => {
    contained = true; incidentOpen = true; current = makeState();
    return { status: "SIMULATED_CONTAINMENT", message: "Demo-only state change; no endpoint was isolated." };
  },
  reset: async () => {
    activeScenario = null; contained = false; incidentOpen = false; demoRunning = false; lastRun = null;
    current = makeState();
    return { status: "RESET", message: "Browser simulation reset." };
  }
};
export default api;
