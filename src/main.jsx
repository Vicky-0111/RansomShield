import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import CopyrightNotice from "./components/CopyrightNotice";
import {
  Activity, AlertTriangle, Ban, Bell, BrainCircuit, Check, ChevronRight,
  Circle, CircleCheck, CircleX, Clock, Cpu, Database, Eye, FileWarning,
  Filter, Gauge, Info, LayoutDashboard, LoaderCircle, LockKeyhole, Menu,
  Network, PanelLeftClose, PanelLeftOpen, Play, Radar, RefreshCw, Search,
  Server, Shield, ShieldAlert, ShieldCheck, Siren, SquareTerminal, Wifi,
  WifiOff, X, Zap
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import api from "./api";
import "./styles.css";

const POLL_MS = 1000;
const HISTORY_MAX = 60;
const OFFLINE_HINT =
  "The dashboard cannot reach the FastAPI backend. Start the RansomShield backend service, then refresh this view.";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [["Overview", LayoutDashboard]],
  },
  {
    label: "Monitoring",
    items: [
      ["Live Monitoring", Activity],
      ["Behavioural Events", Radar],
      ["Endpoints", Server],
    ],
  },
  {
    label: "Detection",
    items: [["Detection Engine", BrainCircuit]],
  },
  {
    label: "Threat Management",
    items: [
      ["Alerts", Bell],
      ["Incidents", Siren],
      ["Response Actions", Zap],
    ],
  },
  {
    label: "Investigation",
    items: [["Evidence", FileWarning]],
  },
  {
    label: "Analytics",
    items: [["ML Analytics", Gauge]],
  },
  {
    label: "System",
    items: [
      ["Testing / Sandbox", SquareTerminal],
      ["System Architecture", Network],
      ["Settings", Shield],
    ],
  },
];

const PAGE_GROUP = Object.fromEntries(
  NAV_GROUPS.flatMap(group => group.items.map(([label]) => [label, group.label]))
);

const SCENARIOS = [
  ["full_workflow", "Full detection workflow", "Baseline → writes → rename → delete"],
  ["mass_rename", "Mass rename", "Baseline → rename to .locked-demo"],
  ["entropy_spike", "Entropy spike", "Baseline → rapid high-entropy rewrites"],
  ["benign_baseline", "Benign workload", "Baseline → slow entropy-heavy writes"],
];

const STATUS_TONE = {
  SAFE: "safe",
  MONITORING: "info",
  LOCAL_LAB: "info",
  SIMULATED_ISOLATION: "critical",
  ISOLATED: "critical",
  CONTAINED: "safe",
  CLOSED: "neutral",
  OPEN: "critical",
  ONLINE: "safe",
  DEGRADED: "warning",
  STARTING: "neutral",
  STOPPED: "critical",
  OFFLINE: "critical",
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const OPERATOR_ENV = String(import.meta.env.VITE_OPERATOR_CONTROLS ?? "auto").toLowerCase();
const OPERATOR_CONTROLS_ALLOWED =
  OPERATOR_ENV === "true" ||
  (OPERATOR_ENV !== "false" && LOCAL_HOSTS.has(window.location.hostname));

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = event => setMatches(event.matches);
    setMatches(media.matches);
    if (media.addEventListener) media.addEventListener("change", onChange);
    else media.addListener(onChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", onChange);
      else media.removeListener(onChange);
    };
  }, [query]);
  return matches;
}

function humanize(value) {
  return String(value || "—").replaceAll("_", " ");
}

function baseName(path) {
  return String(path || "").split(/[\\/]/).pop() || "—";
}

function severityTone(severity) {
  return severity === "CRITICAL" ? "critical"
    : severity === "HIGH" ? "high"
    : severity === "MEDIUM" ? "medium"
    : "safe";
}

function scoreBand(score, threshold = 65) {
  if (Number(score) >= threshold) return "high";
  if (Number(score) >= 50) return "mid";
  return "low";
}

function Badge({ children, tone = "neutral", dot = false }) {
  return (
    <span className={`badge ${String(tone).toLowerCase()}`}>
      {dot && <i className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || "neutral"} dot>{humanize(status)}</Badge>;
}

function Card({ title, subtitle, icon: Icon, actions, children, className = "" }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="card-head">
          <div className="card-heading">
            {Icon && <span className="card-icon"><Icon size={16} aria-hidden="true" /></span>}
            <div>
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

function MetricCard({ label, value, description, icon: Icon, tone = "blue" }) {
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <article className={`kpi kpi-${tone}`} aria-label={`${label}: ${text}`}>
      <div className="kpi-top">
        <span className={`kpi-icon ${tone}`}><Icon size={18} aria-hidden="true" /></span>
        <span className="kpi-spark" aria-hidden="true" />
      </div>
      <div className={`kpi-value ${text.length > 9 ? "is-text" : ""}`}>{text}</div>
      <div className="kpi-label">{label}</div>
      {description && <p className="kpi-description">{description}</p>}
    </article>
  );
}

function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-intro">
      <div className="page-intro-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

function Empty({ online, status = "offline", colSpan, title, description }) {
  const connecting = status === "connecting";
  const Icon = connecting ? LoaderCircle : !online ? WifiOff : Radar;
  const heading = connecting
    ? "Connecting to backend"
    : !online
      ? "Telemetry unavailable"
      : title || "No matching telemetry";
  const copy = connecting
    ? "Requesting the current state from the FastAPI service."
    : !online
      ? "The backend is unreachable. No sample data is displayed."
      : description || "Nothing matches the current filters in this observation window.";

  const panel = (
    <div className="empty-panel">
      <span className={`empty-icon ${connecting ? "spinning" : ""}`}>
        <Icon size={19} aria-hidden="true" />
      </span>
      <strong>{heading}</strong>
      <p>{copy}</p>
    </div>
  );

  if (colSpan) {
    return <tr><td colSpan={colSpan} className="empty-cell">{panel}</td></tr>;
  }
  return <div className="empty-cell">{panel}</div>;
}

function GateNotice({ status }) {
  if (status === "online") return null;
  const offline = status === "offline";
  return (
    <div className={`gate-notice ${offline ? "is-offline" : "is-connecting"}`} role="status">
      <span className="gate-icon">
        {offline ? <WifiOff size={19} aria-hidden="true" /> : <LoaderCircle className="spinning" size={19} aria-hidden="true" />}
      </span>
      <div>
        <b>{offline ? "Backend offline" : "Connecting to backend"}</b>
        <p>
          {offline
            ? OFFLINE_HINT
            : "Requesting the latest security telemetry from /api/state."}
        </p>
      </div>
    </div>
  );
}

function ReadOnlyNotice({ blocked }) {
  return (
    <div className="readonly-banner" role="status">
      <LockKeyhole size={19} aria-hidden="true" />
      <div>
        <b>Read-only public demo</b>
        <p>
          {blocked
            ? "The backend rejected a state-changing request. Simulation, containment and reset controls are disabled for this session."
            : "This deployment exposes live security telemetry only. Simulation, containment and reset controls are available solely to the authorized local operator."}
        </p>
      </div>
      <Badge tone="warning" dot>OPERATOR LOCKED</Badge>
    </div>
  );
}

function ConnectionPill({ status }) {
  const meta = status === "online"
    ? { tone: "ok", label: "Backend online", Icon: Wifi }
    : status === "offline"
      ? { tone: "bad", label: "Backend offline", Icon: WifiOff }
      : { tone: "wait", label: "Connecting", Icon: LoaderCircle };
  const Icon = meta.Icon;
  return (
    <div className={`connection-pill ${meta.tone}`} role="status" aria-live="polite" title={meta.label}>
      <Icon className={status === "connecting" ? "spinning" : ""} size={14} aria-hidden="true" />
      <span className="pill-text">{meta.label}</span>
    </div>
  );
}

function EventRow({ event, onSelect }) {
  return (
    <button
      type="button"
      className="event-row"
      onClick={() => onSelect?.(event)}
      aria-label={`Inspect ${humanize(event.type)} event on ${event.host}, ${event.severity} severity`}
    >
      <span className={`event-dot ${severityTone(event.severity)}`} aria-hidden="true" />
      <span className="event-main">
        <span className="event-top">
          <b>{humanize(event.type)}</b>
          <time>{event.time || "LIVE"}</time>
        </span>
        <span className="event-detail">{event.host} · {event.process} — {event.detail}</span>
        <span className="event-file mono">{baseName(event.path)}</span>
      </span>
      <Badge tone={severityTone(event.severity)}>{event.severity}</Badge>
      <ChevronRight className="event-chevron" size={15} aria-hidden="true" />
    </button>
  );
}

function Pipeline({ online, status, state, live, detection, response }) {
  const connecting = status === "connecting";
  const sensorStatus = state?.sensor?.status;
  const threat = detection?.label === "RANSOMWARE_LIKE";
  const steps = [
    {
      label: "Protected endpoints",
      detail: online ? `${state?.endpoints?.length || 0} authorized lab host` : "Awaiting connection",
      state: online ? "complete" : connecting ? "idle" : "error",
      status: online ? "READY" : connecting ? "WAIT" : "OFFLINE",
      Icon: Server,
    },
    {
      label: "Sensor agent",
      detail: online ? `Filesystem polling · ${sensorStatus || "UNKNOWN"}` : "Awaiting connection",
      state: !online ? (connecting ? "idle" : "error") : sensorStatus === "ONLINE" ? "complete" : sensorStatus === "DEGRADED" ? "warning" : sensorStatus === "STOPPED" ? "error" : "idle",
      status: online ? (sensorStatus || "WAIT") : connecting ? "WAIT" : "OFFLINE",
      Icon: Eye,
    },
    {
      label: "Feature window",
      detail: online ? `${live?.event_count ?? 0} events · ${state?.window_seconds ?? 3}s` : "Awaiting connection",
      state: online ? (live?.window_active ? "active" : "idle") : connecting ? "idle" : "error",
      status: online ? (live?.window_active ? "ACTIVE" : "IDLE") : connecting ? "WAIT" : "OFFLINE",
      Icon: Activity,
    },
    {
      label: "Activity gate",
      detail: online ? `${live?.burst_rate ?? 0}/s burst · min ${state?.burst_gate_min ?? 8}/s` : "Awaiting connection",
      state: online ? (live?.gate_open ? "warning" : "complete") : connecting ? "idle" : "error",
      status: online ? (live?.gate_open ? "OPEN" : "CLOSED") : connecting ? "WAIT" : "OFFLINE",
      Icon: ShieldAlert,
    },
    {
      label: "Random Forest",
      detail: online ? `${live?.live_score ?? 0}% live probability` : "Awaiting connection",
      state: online ? (threat ? "error" : "active") : connecting ? "idle" : "error",
      status: online ? (threat ? "ALERT" : "SCORING") : connecting ? "WAIT" : "OFFLINE",
      Icon: BrainCircuit,
    },
    {
      label: "Response orchestrator",
      detail: online ? (response ? response.network_isolation : "Monitoring for qualifying threat") : "Awaiting connection",
      state: online ? (response ? "contained" : "idle") : connecting ? "idle" : "error",
      status: online ? (response ? "CONTAINED" : "STANDBY") : connecting ? "WAIT" : "OFFLINE",
      Icon: Zap,
    },
  ];

  return (
    <section className="pipeline-panel" aria-label="Detection processing pipeline">
      <div className="pipeline-head">
        <div>
          <span className="eyebrow">Processing pipeline</span>
          <h2>Endpoint to response, in real time</h2>
        </div>
        <Badge tone={online ? (threat ? "critical" : "safe") : connecting ? "neutral" : "warning"} dot>
          {online ? (threat ? "PIPELINE ALERTING" : "PIPELINE HEALTHY") : connecting ? "CONNECTING" : "PIPELINE OFFLINE"}
        </Badge>
      </div>
      <ol className="pipeline">
        {steps.map(({ label, detail, state: stepState, status: stepStatus, Icon }, index) => (
          <li className={`pipe-step ${stepState}`} key={label}>
            <span className="pipe-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="pipe-icon"><Icon size={17} aria-hidden="true" /></span>
            <div className="pipe-copy">
              <b>{label}</b>
              <small>{detail}</small>
            </div>
            <span className={`pipe-status ${stepState}`}>{stepStatus}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProcessTree({ events = [], features = {}, simulator }) {
  const counts = events.reduce((acc, event) => {
    const process = event.process || "unknown";
    acc[process] = (acc[process] || 0) + 1;
    return acc;
  }, {});
  const processes = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const primary = processes[0]?.[0];
  return (
    <div className="tree">
      <div className="tree-node root">
        <Cpu size={15} aria-hidden="true" />
        <span>RansomShield sensor</span>
        <small>LOCAL LAB</small>
      </div>
      <div className="tree-line" />
      <div className={`tree-node ${primary ? "danger" : ""}`}>
        <ShieldAlert size={15} aria-hidden="true" />
        <span>{primary || "no attributed process"}</span>
        <small>{events.length ? `${events.length} events` : "WAITING"}</small>
      </div>
      <div className="tree-branches">
        <span>writes × {features.writes_per_sec ?? 0}/s</span>
        <span>renames × {features.renames_per_sec ?? 0}/s</span>
        <span>deletes × {features.deletes_per_sec ?? 0}/s</span>
        <span>simulator PID {simulator?.pid ?? "—"}</span>
      </div>
    </div>
  );
}

function detectionPresentation({ online, status, detection, live }) {
  if (status === "connecting") {
    return {
      tone: "neutral", eyebrow: "CONNECTING", title: "Loading detection state",
      detail: "Requesting the current verdict from the backend.",
      badge: "CONNECTING", Icon: LoaderCircle, spinning: true,
    };
  }
  if (!online) {
    return {
      tone: "offline", eyebrow: "BACKEND OFFLINE", title: "Detection unavailable",
      detail: "No verdict is displayed while the backend is unreachable.",
      badge: "OFFLINE", Icon: WifiOff,
    };
  }
  if (!detection?.evaluated) {
    return {
      tone: "neutral", eyebrow: "AWAITING TELEMETRY", title: "No verdict recorded yet",
      detail: detection?.reason || "The detector will record its first verdict after the next evaluation.",
      badge: "AWAITING", Icon: Clock,
    };
  }
  if (detection.label === "RANSOMWARE_LIKE") {
    return {
      tone: "critical", eyebrow: "SIMULATED THREAT CONFIRMED",
      title: "Ransomware-like activity",
      detail: detection.reason,
      badge: "RANSOMWARE-LIKE", Icon: ShieldAlert,
    };
  }
  if (detection.gate_suppressed || live?.gate_open) {
    return {
      tone: "warning", eyebrow: "ELEVATED ACTIVITY",
      title: "Activity below the verdict threshold",
      detail: detection.reason,
      badge: "BELOW THRESHOLD", Icon: Activity,
    };
  }
  return {
    tone: "safe", eyebrow: "MONITORING", title: "No suspicious activity",
    detail: detection.reason || "The current behavioural window is below the activity gate.",
    badge: "BENIGN", Icon: ShieldCheck,
  };
}

function buildResponseSteps({ online, detection, response, openIncident }) {
  const evaluated = Boolean(detection?.evaluated);
  const threat = detection?.label === "RANSOMWARE_LIKE";
  const evidence = response?.evidence;
  const failed = Number(evidence?.failed_count || 0);
  const captured = Number(evidence?.captured_count || 0);
  const audit = response?.audit;

  return [
    {
      label: "Threat detected",
      detail: !online
        ? "Unavailable"
        : threat
          ? `${detection.risk_level || "—"} risk · ${detection.score ?? 0}%`
          : evaluated
            ? "No qualifying verdict on record"
            : "Waiting for the detector",
      status: !online ? "blocked" : threat ? "complete" : evaluated ? "idle" : "pending",
    },
    {
      label: "Process response",
      detail: response?.process_termination || (online ? "Not triggered" : "Unavailable"),
      status: response ? "complete" : online ? "pending" : "blocked",
    },
    {
      label: "Network isolation",
      detail: response?.network_isolation || (online ? "Not triggered" : "Unavailable"),
      status: response ? "complete" : online ? "pending" : "blocked",
    },
    {
      label: "Evidence captured",
      detail: response
        ? evidence?.evidence_preserved
          ? `${captured} artifact${captured === 1 ? "" : "s"} captured`
          : failed
            ? `${failed} capture failure${failed === 1 ? "" : "s"}`
            : "No artifacts captured"
        : online ? "Waiting for an incident" : "Unavailable",
      status: !online
        ? "blocked"
        : !response
          ? "pending"
          : failed
            ? "failed"
            : evidence?.evidence_preserved ? "complete" : "pending",
    },
    {
      label: "Incident record",
      detail: openIncident
        ? `${openIncident.id} · ${openIncident.opened_at}`
        : online ? "No open incident" : "Unavailable",
      status: openIncident ? "complete" : online ? "pending" : "blocked",
    },
    {
      label: "Audit trail",
      detail: audit
        ? audit.recorded
          ? `Recorded · ${audit.timestamp || "timestamp unavailable"}`
          : audit.error || "Audit write failed"
        : online ? "No response action recorded" : "Unavailable",
      status: !online ? "blocked" : !audit ? "pending" : audit.recorded ? "complete" : "failed",
    },
  ];
}

const WORKFLOW_META = {
  complete: { Icon: Check, label: "COMPLETE" },
  pending: { Icon: Clock, label: "PENDING" },
  idle: { Icon: Circle, label: "NOT REQUIRED" },
  blocked: { Icon: Ban, label: "UNAVAILABLE" },
  failed: { Icon: CircleX, label: "FAILED" },
};

function Workflow({ steps }) {
  return (
    <div className="workflow">
      {steps.map(step => {
        const meta = WORKFLOW_META[step.status] || WORKFLOW_META.pending;
        const Icon = meta.Icon;
        return (
          <div className={`workflow-step ${step.status}`} key={step.label}>
            <span className="workflow-marker"><Icon size={13} aria-hidden="true" /></span>
            <div className="workflow-copy">
              <b>{step.label}</b>
              <small>{step.detail}</small>
            </div>
            <span className="workflow-status">{meta.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map(entry => (
        <div className="chart-tooltip-row" key={entry.dataKey || entry.name}>
          <span className="chart-tooltip-dot" style={{ background: entry.color }} aria-hidden="true" />
          <span>{entry.name}</span>
          <b>{entry.dataKey === "live" ? `${Number(entry.value).toFixed(1)}%` : Number(entry.value).toFixed(2)}</b>
        </div>
      ))}
    </div>
  );
}

function ChartState({ online, status }) {
  const connecting = status === "connecting";
  const Icon = connecting ? LoaderCircle : WifiOff;
  return (
    <div className="chart-empty">
      <span className={`empty-icon large ${connecting ? "spinning" : ""}`}>
        <Icon size={21} aria-hidden="true" />
      </span>
      <strong>{connecting ? "Connecting to telemetry" : "Behavioural history unavailable"}</strong>
      <p>
        {connecting
          ? "Waiting for the first backend state response."
          : "The backend is unreachable. The interface never generates sample history to fill the chart."}
      </p>
    </div>
  );
}

function ReliabilityBanner({ title, children, tone = "info", icon: Icon = Info }) {
  return (
    <div className={`notice-banner ${tone}`}>
      <span className="notice-icon"><Icon size={19} aria-hidden="true" /></span>
      <div>
        <b>{title}</b>
        <p>{children}</p>
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState("Overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem("ransomshield.sidebarCollapsed") === "true"; }
    catch { return false; }
  });
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [history, setHistory] = useState([]);
  const [startingDemo, setStartingDemo] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [notice, setNotice] = useState(null);
  const [operatorBlocked, setOperatorBlocked] = useState(false);
  const [tick, setTick] = useState(0);
  const inFlight = useRef(false);
  const noticeTimer = useRef(null);
  const sidebarRef = useRef(null);
  const modalRef = useRef(null);
  const isMobile = useMediaQuery("(max-width: 980px)");

  const online = status === "online" && Boolean(state);
  const demoRunning = startingDemo || Boolean(state?.simulator?.running);
  const canOperate = OPERATOR_CONTROLS_ALLOWED && !operatorBlocked;
  const group = PAGE_GROUP[page] || "Security Operations";

  const flash = useCallback((message, tone = "ok") => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ message, tone });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("ransomshield.sidebarCollapsed", String(collapsed)); }
    catch { /* storage is optional */ }
  }, [collapsed]);

  useEffect(() => {
    const element = sidebarRef.current;
    if (!element) return;
    if (isMobile && !mobileOpen) element.setAttribute("inert", "");
    else element.removeAttribute("inert");
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen || selectedEvent ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen, selectedEvent]);

  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [page]);

  useEffect(() => {
    if (!selectedEvent) return undefined;
    const previousFocus = document.activeElement;
    const modal = modalRef.current;
    const focusables = () => modal?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) || [];
    focusables()[0]?.focus();
    const onKeyDown = event => {
      if (event.key === "Escape") {
        setSelectedEvent(null);
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = Array.from(focusables());
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    };
  }, [selectedEvent]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const data = await api.state();
        if (!active) return;
        setState(data);
        setStatus("online");
        const live = data.live_window || {};
        const stamp = live.sampled_at;
        if (stamp) {
          setHistory(previous => {
            const next = [...previous, {
              t: stamp,
              live: Number(live.live_score || 0),
              entropy: Number(live.features?.entropy_delta || 0),
              burst: Number(live.burst_rate || 0),
            }];
            return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next;
          });
        }
      } catch {
        if (active) {
          setStatus("offline");
          setState(null);
          setHistory([]);
        }
      } finally {
        inFlight.current = false;
      }
    };
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [tick]);

  const detection = state?.detection;
  const endpoint = state?.endpoints?.[0];
  const events = useMemo(() => (state?.events || []).map(event => ({
    type: event.type,
    host: event.endpoint || state.endpoint_id,
    process: event.process,
    detail: event.detail,
    severity: event.severity,
    time: event.timestamp,
    path: event.path,
    value: event.value,
    epoch: event.epoch,
  })), [state]);

  const stats = useMemo(() => ({
    protected: state?.endpoints?.length || 0,
    threats: state?.incidents?.length || 0,
    isolated: (state?.endpoints || []).filter(item => item.status === "ISOLATED").length,
    alerts: events.filter(event => event.severity === "CRITICAL" || event.severity === "HIGH").length,
    openIncident: (state?.incidents || []).find(incident => incident.status === "OPEN") || null,
  }), [state, events]);

  const handleActionError = useCallback((error, action) => {
    if (error?.status === 403) {
      setOperatorBlocked(true);
      flash("This deployment is read-only. State-changing actions are disabled by the backend.", "warn");
      return;
    }
    if (error?.status === 409) {
      flash(action === "scenario"
        ? "A safe-lab simulation is already running. Wait for it to finish."
        : "No qualifying detection is available for that action yet.", "warn");
      return;
    }
    flash(action === "scenario"
      ? "Could not start the safe-lab simulation. Check the backend status and try again."
      : action === "reset"
        ? "Could not reset the lab. Check the backend status and try again."
        : "Could not complete the containment action. Check the backend status and try again.", "warn");
  }, [flash]);

  const runScenario = useCallback(async (scenario = "full_workflow") => {
    if (!canOperate) {
      flash("Simulation controls are unavailable in this read-only session.", "warn");
      return;
    }
    if (demoRunning) {
      flash("A safe lab simulation is already running. Wait for it to finish.", "warn");
      return;
    }
    setStartingDemo(true);
    try {
      const result = await api.runWorkflow(scenario);
      setState(await api.state());
      flash(result.message || "Safe lab simulation started.");
    } catch (error) {
      handleActionError(error, "scenario");
    } finally {
      setStartingDemo(false);
    }
  }, [canOperate, demoRunning, flash, handleActionError]);

  const containNow = useCallback(async () => {
    if (!canOperate) {
      flash("Containment controls are unavailable in this read-only session.", "warn");
      return;
    }
    try {
      await api.contain();
      setState(await api.state());
      flash("Safe simulated containment recorded for the lab endpoint.");
    } catch (error) {
      handleActionError(error, "contain");
    }
  }, [canOperate, flash, handleActionError]);

  const resetLab = useCallback(async () => {
    if (!canOperate) {
      flash("Reset controls are unavailable in this read-only session.", "warn");
      return;
    }
    try {
      await api.reset();
      setSelectedEvent(null);
      setState(await api.state());
      flash("Lab state reset. Telemetry, score, incidents and response record were cleared; the append-only audit trail was kept.");
    } catch (error) {
      handleActionError(error, "reset");
    }
  }, [canOperate, flash, handleActionError]);

  const refresh = useCallback(() => {
    setState(null);
    setStatus("connecting");
    setTick(value => value + 1);
  }, []);

  const navigate = useCallback(label => {
    setPage(label);
    setMobileOpen(false);
  }, []);

  const shared = {
    state, online, status, detection, endpoint, events, history, stats,
    simulator: state?.simulator, onSelect: setSelectedEvent, runScenario,
    demoRunning, navigate, canOperate, operatorBlocked,
  };

  const renderPage = () => {
    switch (page) {
      case "Overview": return <Overview {...shared} />;
      case "Live Monitoring": return <Monitoring {...shared} />;
      case "Behavioural Events": return <BehaviouralEvents {...shared} />;
      case "Endpoints": return <Endpoints {...shared} onIsolate={containNow} onRefresh={refresh} />;
      case "Detection Engine": return <DetectionEngine {...shared} />;
      case "Alerts": return <Alerts {...shared} />;
      case "Incidents": return <Incidents {...shared} />;
      case "Evidence": return <Evidence {...shared} />;
      case "Response Actions": return <Response {...shared} />;
      case "ML Analytics": return <Analytics {...shared} />;
      case "Testing / Sandbox": return <Sandbox {...shared} onRefresh={refresh} onReset={resetLab} />;
      case "System Architecture": return <Architecture state={state} />;
      default: return <Settings state={state} online={online} />;
    }
  };

  const sensorLabel = status === "offline"
    ? "Backend unreachable"
    : status === "connecting"
      ? "Connecting…"
      : state?.sensor?.status === "ONLINE"
        ? "Polling lab sandbox"
        : state?.sensor?.status === "DEGRADED"
          ? "Sensor degraded"
          : state?.sensor?.status === "STOPPED"
            ? "Sensor stopped"
            : "Sensor starting";

  const sensorTone = status !== "online"
    ? "bad"
    : state?.sensor?.status === "ONLINE"
      ? "ok"
      : state?.sensor?.status === "STOPPED"
        ? "bad"
        : "warn";

  return (
    <div className={`app ${collapsed ? "is-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <aside ref={sidebarRef} id="primary-sidebar" className={`sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><Shield size={20} strokeWidth={2.2} /></div>
          <div className="brand-copy">
            <b>RansomShield</b>
            <small>Behavioural EDR</small>
          </div>
          <button
            type="button"
            className="icon-btn sidebar-close mobile-only"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="env" title="Isolated safe-lab environment">
          <span className={`status-dot ${status === "offline" ? "bad" : status === "connecting" ? "warn" : "ok"}`} aria-hidden="true" />
          <span className="env-label">Safe lab</span>
          <span className="env-tag">DEMO</span>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {NAV_GROUPS.map(navGroup => (
            <div className="nav-group" key={navGroup.label}>
              <div className="nav-group-title" aria-hidden={collapsed ? "true" : undefined}>{navGroup.label}</div>
              {navGroup.items.map(([label, Icon]) => {
                const active = page === label;
                return (
                  <button
                    type="button"
                    key={label}
                    className={`nav-item ${active ? "is-active" : ""}`}
                    onClick={() => navigate(label)}
                    aria-current={active ? "page" : undefined}
                    title={label}
                  >
                    <span className="nav-icon"><Icon size={17} aria-hidden="true" /></span>
                    <span className="nav-label">{label}</span>
                    {label === "Alerts" && stats.alerts > 0 && (
                      <span className="nav-badge" aria-label={`${stats.alerts} high severity alerts`}>
                        {stats.alerts > 99 ? "99+" : stats.alerts}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sensor-mini">
            <span className={`status-dot ${sensorTone}`} aria-hidden="true" />
            <div className="sensor-copy">
              <b>Sensor agent</b>
              <small>{sensorLabel}</small>
            </div>
          </div>
          <div className="user-mini">
            <div className="avatar" aria-hidden="true">AD</div>
            <div className="user-copy">
              <b>Administrator</b>
              <small>Security Operator</small>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          className="scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      <main className="main" id="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-btn mobile-menu mobile-only"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="primary-sidebar"
            >
              <Menu size={19} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn collapse-btn desktop-only"
              onClick={() => setCollapsed(value => !value)}
              aria-label={collapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
            </button>
            <div className="page-identity">
              <div className="crumb">
                <span>Security Operations</span>
                <ChevronRight size={11} aria-hidden="true" />
                <span>{group}</span>
                <ChevronRight size={11} aria-hidden="true" />
                <b>{page}</b>
              </div>
              <div className="top-title">{page}</div>
            </div>
          </div>
          <div className="top-actions">
            <ConnectionPill status={status} />
            <button
              type="button"
              className="icon-btn"
              onClick={refresh}
              aria-label="Refresh telemetry"
              title="Refresh telemetry"
            >
              <RefreshCw className={status === "connecting" ? "spinning" : ""} size={17} aria-hidden="true" />
            </button>
            <div className="user-chip" title="Administrator — Security Operator">
              <span className="top-avatar" aria-hidden="true">AD</span>
              <div>
                <b>Administrator</b>
                <small>Security Operator</small>
              </div>
            </div>
          </div>
        </header>

        {notice && (
          <div className={`toast ${notice.tone === "warn" ? "warn" : ""}`} role="status" aria-live="polite">
            {notice.tone === "warn"
              ? <AlertTriangle size={17} aria-hidden="true" />
              : <CircleCheck size={17} aria-hidden="true" />}
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification">
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="content">
          <GateNotice status={status} />
          {!canOperate && <ReadOnlyNotice blocked={operatorBlocked} />}
          <div className="page-transition" key={page}>
            {renderPage()}
          </div>
        </div>

        <footer>
          RansomShield · Behavioural Ransomware Detection &amp; Automated Response · Safe isolated-lab simulation · no real ransomware is ever executed
        </footer>
        <CopyrightNotice />
      </main>

      {selectedEvent && (
        <div className="modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-modal-title"
            ref={modalRef}
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">Event evidence</span>
                <h3 id="event-modal-title">{humanize(selectedEvent.type)}</h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedEvent(null)}
                aria-label="Close event evidence"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="modal-grid">
              <div><small>Endpoint</small><b>{selectedEvent.host || "—"}</b></div>
              <div><small>Process</small><b>{selectedEvent.process || "—"}</b></div>
              <div><small>Severity</small><Badge tone={severityTone(selectedEvent.severity)}>{selectedEvent.severity}</Badge></div>
              <div><small>Timestamp</small><b>{selectedEvent.time || "Live"}</b></div>
              <div className="modal-wide"><small>Observed file</small><b className="mono">{baseName(selectedEvent.path)}</b></div>
            </div>
            <div className="evidence-box">
              <FileWarning size={18} aria-hidden="true" />
              <div>
                <b>Observed behaviour</b>
                <p>{selectedEvent.detail || "No additional detail supplied by the sensor."}</p>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedEvent(null)}>Close evidence</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Overview({ state, online, status, detection, endpoint, events, history, stats, simulator, onSelect, runScenario, demoRunning, navigate, canOperate }) {
  const response = state?.response;
  const live = state?.live_window;
  const thresholdPct = Math.round((detection?.threshold ?? 0.65) * 100);
  const presentation = detectionPresentation({ online, status, detection, live });
  const DetectionIcon = presentation.Icon;
  const responseSteps = buildResponseSteps({
    online, detection, response, openIncident: stats.openIncident,
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow="Security overview"
        title="Ransomware behaviour at a glance"
        description={`Detect, score and contain suspicious endpoint activity inside a ${state?.window_seconds ?? 3}-second behavioural observation window.`}
        actions={(
          <>
            <Badge tone={online ? "safe" : status === "connecting" ? "neutral" : "critical"} dot>
              {online ? "LIVE TELEMETRY" : status === "connecting" ? "CONNECTING" : "TELEMETRY OFFLINE"}
            </Badge>
            {canOperate && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => runScenario("full_workflow")}
                disabled={demoRunning}
              >
                <Play size={15} aria-hidden="true" />
                {demoRunning ? (simulator?.phase_label || "Simulation running…") : "Run safe detection demo"}
              </button>
            )}
          </>
        )}
      />

      <div className="kpis">
        <MetricCard
          label="Protected endpoints"
          value={online ? stats.protected : "—"}
          description="Authorized laboratory hosts"
          icon={Server}
          tone="blue"
        />
        <MetricCard
          label="Threats detected"
          value={online ? stats.threats : "—"}
          description="Recorded incident ledger"
          icon={ShieldAlert}
          tone="red"
        />
        <MetricCard
          label="High severity alerts"
          value={online ? stats.alerts : "—"}
          description="HIGH and CRITICAL events"
          icon={Bell}
          tone="amber"
        />
        <MetricCard
          label="Hosts isolated"
          value={online ? stats.isolated : "—"}
          description="Simulated containment only"
          icon={WifiOff}
          tone="purple"
        />
        <MetricCard
          label="Detection window"
          value={online ? `${state.window_seconds}s` : "—"}
          description="Rolling behavioural window"
          icon={Zap}
          tone="green"
        />
        <MetricCard
          label="Sensor coverage"
          value={online ? (state?.sensor?.status || "LIVE") : status === "connecting" ? "WAIT" : "OFFLINE"}
          description={online ? "Filesystem sensor health" : "Awaiting backend connection"}
          icon={Radar}
          tone="cyan"
        />
      </div>

      <Pipeline
        online={online}
        status={status}
        state={state}
        live={live}
        detection={detection}
        response={response}
      />

      <div className="grid-2">
        <Card
          title="Behavioural activity"
          subtitle="Live model probability and entropy change"
          icon={Activity}
          actions={(
            <div className="chart-legend" aria-hidden="true">
              <span><i className="legend-dot probability" />Probability</span>
              <span><i className="legend-dot entropy" />Entropy Δ</span>
              <span><i className="legend-dot threshold" />Threshold</span>
            </div>
          )}
        >
          <div className="chart-wrap">
            {history.length > 1 ? (
              <div role="img" aria-label="Line chart of live ransomware probability and entropy change over time">
                <ResponsiveContainer width="100%" height={264}>
                  <LineChart data={history} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="#19273d" strokeDasharray="2 6" vertical={false} />
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "#8494ab", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "#22324a" }}
                      minTickGap={28}
                    />
                    <YAxis
                      yAxisId="p"
                      domain={[0, 100]}
                      width={42}
                      tick={{ fill: "#8494ab", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={value => `${value}%`}
                    />
                    <YAxis
                      yAxisId="e"
                      orientation="right"
                      width={42}
                      tick={{ fill: "#6f8199", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#3b5578", strokeDasharray: "3 4" }} />
                    {online && detection?.threshold != null && (
                      <ReferenceLine
                        yAxisId="p"
                        y={thresholdPct}
                        stroke="#f2b84b"
                        strokeDasharray="4 6"
                        strokeOpacity={0.75}
                      />
                    )}
                    <Line
                      yAxisId="p"
                      type="monotone"
                      dataKey="live"
                      stroke="#5b9dff"
                      strokeWidth={2.4}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      name="Ransomware probability %"
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="e"
                      type="monotone"
                      dataKey="entropy"
                      stroke="#4cd7e8"
                      strokeWidth={1.8}
                      dot={false}
                      name="Mean entropy Δ"
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : online ? (
              <div className="chart-empty">
                <span className="empty-icon large"><Activity size={21} aria-hidden="true" /></span>
                <strong>Collecting live samples</strong>
                <p>The chart populates from real backend evaluations. No historical data is generated by the interface.</p>
              </div>
            ) : (
              <ChartState online={online} status={status} />
            )}
          </div>
          <div className="chart-foot">
            <span>Source: <b>/api/state</b> · live_window</span>
            <span>{history.length} live sample{history.length === 1 ? "" : "s"} retained</span>
          </div>
        </Card>

        <Card title="Current detection" subtitle="Latched verdict from the two-stage detector" icon={ShieldAlert}>
          <div className="detection-panel">
            <div className="detection-hero" data-tone={presentation.tone}>
              <span className={`detection-mark ${presentation.spinning ? "spinning" : ""}`}>
                <DetectionIcon size={25} aria-hidden="true" />
              </span>
              <div className="detection-copy">
                <span className="eyebrow">{presentation.eyebrow}</span>
                <h2>{presentation.title}</h2>
                <p>{presentation.detail}</p>
              </div>
            </div>

            <div className="score-row">
              <div>
                <small>Random Forest score</small>
                <strong>{online && detection?.evaluated ? `${detection.score}%` : "—"}</strong>
              </div>
              <div>
                <small>Confidence</small>
                <strong>{online && detection?.evaluated ? `${detection.confidence}%` : "—"}</strong>
              </div>
              <div>
                <small>Risk level</small>
                <strong className={detection?.label === "RANSOMWARE_LIKE" ? "threat-text" : ""}>
                  {online && detection?.evaluated ? detection.risk_level : "—"}
                </strong>
              </div>
            </div>

            <div className="meter-block">
              <div className="meter-label">
                <span>Live probability</span>
                <b>{online ? `${live?.live_score ?? 0}%` : "—"}</b>
              </div>
              <div className="meter" aria-hidden="true">
                <span
                  className={scoreBand(live?.live_score, thresholdPct)}
                  style={{ width: `${Math.min(Number(live?.live_score || 0), 100)}%` }}
                />
              </div>
              <div className="meter-scale">
                <span>0%</span>
                <span>Verdict threshold {thresholdPct}%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="detection-meta">
              <span><small>Endpoint</small><b>{online ? endpoint?.id || "—" : "—"}</b></span>
              <span><small>Decided at</small><b>{online ? detection?.decided_at || "Awaiting first evaluation" : "—"}</b></span>
              <span><small>Window</small><b>{online ? `${state?.window_seconds ?? 3}s` : "—"}</b></span>
            </div>

            <p className="detection-note">
              {online && detection?.reason
                ? detection.reason
                : online
                  ? "The recorded verdict updates only when the backend detector actually decides."
                  : "No detection state is available while the backend is unreachable."}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card
          title="Live security events"
          subtitle="Latest filesystem telemetry from the lab sensor"
          icon={Radar}
          actions={(
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("Live Monitoring")}>
              View all <ChevronRight size={14} aria-hidden="true" />
            </button>
          )}
        >
          <div className="event-list">
            {events.length
              ? events.slice(0, 7).map((event, index) => (
                <EventRow key={`${event.epoch}-${index}`} event={event} onSelect={onSelect} />
              ))
              : <Empty online={online} status={status} />}
          </div>
        </Card>

        <Card title="Response workflow" subtitle="Simulated containment stages from the backend" icon={Zap}>
          <Workflow steps={responseSteps.slice(0, 5)} />
          <div className="card-footnote">
            <Info size={14} aria-hidden="true" />
            Response actions are recorded simulations. No host network or third-party process is changed.
          </div>
        </Card>
      </div>
    </div>
  );
}

function Monitoring({ online, status, events, detection, state, simulator, onSelect, navigate }) {
  const live = state?.live_window;
  const features = live?.features || state?.features || {};
  const threat = detection?.label === "RANSOMWARE_LIKE";
  const thresholdPct = Math.round((detection?.threshold ?? 0.65) * 100);
  const featureItems = [
    ["Write rate", features.writes_per_sec, "/s"],
    ["Rename rate", features.renames_per_sec, "/s"],
    ["Delete rate", features.deletes_per_sec, "/s"],
    ["Create rate", features.creates_per_sec, "/s"],
    ["Extension change", features.extension_changes_per_sec, "/s"],
    ["Unique files", features.unique_files_per_sec, "/s"],
    ["Entropy Δ", features.entropy_delta, ""],
    ["Burst rate", live?.burst_rate, "/s"],
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Live telemetry"
        title="Real-time behavioural monitoring"
        description="Streaming lab filesystem events, live feature-window rates and the latched detection verdict."
        actions={(
          <>
            <div className={`live-chip ${live?.window_active ? "is-active" : "is-idle"}`}>
              <span className={`status-dot ${live?.window_active ? "ok" : "idle"}`} aria-hidden="true" />
              {status === "connecting" ? "CONNECTING" : live?.window_active ? "WINDOW ACTIVE" : "WINDOW IDLE"}
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => navigate("Detection Engine")}>
              <BrainCircuit size={15} aria-hidden="true" /> Detection engine
            </button>
          </>
        )}
      />

      <div className="grid-2">
        <Card
          title="Live activity stream"
          subtitle={`${events.length} events observed in the retained telemetry`}
          icon={Activity}
        >
          <div className="event-list tall">
            {events.length
              ? events.map((event, index) => (
                <EventRow key={`${event.epoch}-${index}`} event={event} onSelect={onSelect} />
              ))
              : <Empty online={online} status={status} />}
          </div>
        </Card>

        <div className="stack">
          <Card title={`Live feature window — ${state?.window_seconds ?? 3}s`} subtitle="Computed by the backend sensor" icon={Gauge}>
            <div className="feature-grid">
              {featureItems.map(([label, value, unit]) => (
                <div className="feature-tile" key={label}>
                  <small>{label}</small>
                  <b>{online ? `${value ?? "—"}${unit}` : "—"}</b>
                  <span>{unit ? "per second" : "window delta"}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Observed process activity" subtitle="Attribution from the sensor stream" icon={Cpu}>
            <ProcessTree events={events} features={features} simulator={simulator} />
          </Card>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Live model probability" subtitle="Stage 2 inference over the current window" icon={Activity}>
          <div className="score-row">
            <div><small>Live probability</small><strong>{online ? `${live?.live_score ?? 0}%` : "—"}</strong></div>
            <div><small>Activity gate</small><strong>{online ? (live?.gate_open ? "OPEN" : "CLOSED") : "—"}</strong></div>
            <div><small>Window events</small><strong>{online ? live?.event_count ?? 0 : "—"}</strong></div>
          </div>
          <div className="meter-block compact">
            <div className="meter" aria-hidden="true">
              <span
                className={scoreBand(live?.live_score, thresholdPct)}
                style={{ width: `${Math.min(Number(live?.live_score || 0), 100)}%` }}
              />
            </div>
            <div className="meter-scale">
              <span>0%</span>
              <span>Threshold {thresholdPct}%</span>
              <span>100%</span>
            </div>
          </div>
          <p className="detection-note">
            Stage 2 runs on every tick. The recorded verdict below only changes when the two-stage detector actually decides.
          </p>
        </Card>

        <Card title="Recorded verdict" subtitle="Latched decision shared by every page" icon={ShieldAlert}>
          <div className="score-row">
            <div>
              <small>Verdict</small>
              <strong className={threat ? "threat-text" : ""}>
                {online ? (detection?.evaluated ? humanize(detection.label) : "AWAITING") : "—"}
              </strong>
            </div>
            <div><small>Score</small><strong>{online && detection?.evaluated ? `${detection.score}%` : "—"}</strong></div>
            <div><small>Risk</small><strong>{online && detection?.evaluated ? detection.risk_level : "—"}</strong></div>
          </div>
          <p className="detection-note">
            {online
              ? detection?.reason || "No verdict has been recorded yet."
              : "No telemetry available while the backend is unreachable."}
          </p>
          <div className="card-footnote">
            <Clock size={14} aria-hidden="true" />
            Decided at {online ? detection?.decided_at || "—" : "—"} · {online ? `${detection?.confidence ?? 0}% confidence` : "no data"}
          </div>
        </Card>
      </div>
    </div>
  );
}

function BehaviouralEvents({ online, status, events, detection, onSelect }) {
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const types = [...new Set(events.map(event => event.type).filter(Boolean))].sort();
  const filtered = events.filter(event => {
    const severityMatch = severityFilter === "ALL" || event.severity === severityFilter;
    const typeMatch = typeFilter === "ALL" || event.type === typeFilter;
    const queryMatch = !normalizedQuery || [
      event.host, event.process, event.detail, baseName(event.path), event.time,
    ].some(value => String(value || "").toLowerCase().includes(normalizedQuery));
    return severityMatch && typeMatch && queryMatch;
  });
  const critical = events.filter(event => event.severity === "CRITICAL").length;
  const high = events.filter(event => event.severity === "HIGH").length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Observation stream"
        title="Behavioural events"
        description="Every filesystem operation retained by the lab sensor, with its attributed process and severity."
        actions={(
          <>
            <Badge tone={online ? "info" : "critical"} dot>
              {online ? `${events.length} events retained` : "BACKEND OFFLINE"}
            </Badge>
            <span className="summary-chip">{critical} critical · {high} high</span>
          </>
        )}
      />

      <div className="toolbar">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search behavioural events</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search endpoint, process or file"
          />
        </label>
        <label className="select-field">
          <Filter size={14} aria-hidden="true" />
          <span className="sr-only">Filter events by severity</span>
          <select value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}>
            <option value="ALL">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label className="select-field">
          <span className="sr-only">Filter events by operation</span>
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
            <option value="ALL">All operations</option>
            {types.map(type => <option value={type} key={type}>{humanize(type)}</option>)}
          </select>
        </label>
        <span className="toolbar-count">{filtered.length} of {events.length} shown</span>
      </div>

      <Card
        title="Event ledger"
        subtitle={online
          ? `Verdict on record: ${detection?.evaluated ? humanize(detection.label) : "awaiting first evaluation"}`
          : "No telemetry available while the backend is unreachable"}
        icon={Radar}
      >
        <div className="event-list tall">
          {filtered.length
            ? filtered.map((event, index) => (
              <EventRow key={`${event.epoch}-${index}`} event={event} onSelect={onSelect} />
            ))
            : <Empty online={online} status={status} />}
        </div>
      </Card>

      <p className="detection-note page-note">
        Select an event to inspect its retained evidence. Only the file name is shown; full laboratory paths never leave the backend.
      </p>
    </div>
  );
}

function Endpoints({ online, status, state, endpoint, detection, onIsolate, onRefresh, canOperate }) {
  const threat = detection?.label === "RANSOMWARE_LIKE";
  return (
    <div className="page">
      <PageHeader
        eyebrow="Endpoint control"
        title="Protected endpoints"
        description="The single authorized safe laboratory host watched by the behavioural sensor."
        actions={(
          <>
            <Badge tone={online ? "safe" : status === "connecting" ? "neutral" : "critical"} dot>
              {online ? "SENSOR REACHABLE" : status === "connecting" ? "CONNECTING" : "OFFLINE"}
            </Badge>
            <button type="button" className="btn btn-secondary" onClick={onRefresh}>
              <RefreshCw size={15} aria-hidden="true" /> Sync sensors
            </button>
          </>
        )}
      />

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Protected endpoint inventory and simulation actions</caption>
            <thead>
              <tr>
                <th scope="col">Endpoint</th>
                <th scope="col">Operating system</th>
                <th scope="col">Address</th>
                <th scope="col">Status</th>
                <th scope="col">Detection score</th>
                <th scope="col">Network</th>
                <th scope="col">Sensor</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {endpoint ? (
                <tr>
                  <td><b>{endpoint.id}</b><small>{endpoint.last}</small></td>
                  <td>{endpoint.os}</td>
                  <td className="mono">{endpoint.ip}</td>
                  <td><StatusBadge status={endpoint.status} /></td>
                  <td>
                    <div className="score-cell">
                      <div className="mini-score" aria-hidden="true">
                        <span style={{ width: `${Number(endpoint.score || 0)}%` }} />
                      </div>
                      <b>{endpoint.score}%</b>
                    </div>
                    <small>Risk {online ? endpoint.risk_level || "—" : "—"}</small>
                  </td>
                  <td><StatusBadge status={endpoint.network} /></td>
                  <td><StatusBadge status={online ? endpoint.sensor : "OFFLINE"} /></td>
                  <td>
                    {canOperate ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={onIsolate}
                        disabled={!threat || endpoint.status === "ISOLATED"}
                        title={!threat ? "Containment requires a recorded ransomware-like verdict" : undefined}
                      >
                        {endpoint.status === "ISOLATED" ? "Contained" : "Simulate contain"}
                      </button>
                    ) : (
                      <Badge tone="warning">READ-ONLY</Badge>
                    )}
                  </td>
                </tr>
              ) : <Empty online={online} status={status} colSpan={8} />}
            </tbody>
          </table>
        </div>
      </div>

      <ReliabilityBanner title="Safe-lab boundary" tone="safe" icon={ShieldCheck}>
        The simulator only touches the backend's isolated laboratory sandbox. No host networking is changed and no third-party process is terminated.
      </ReliabilityBanner>
    </div>
  );
}

function DetectionEngine({ online, status, detection, state }) {
  const live = state?.live_window;
  const importance = detection?.feature_importance || state?.model?.feature_importance || [];
  const threat = detection?.label === "RANSOMWARE_LIKE";
  const bars = Array.isArray(importance[0])
    ? importance
    : importance.map(item => [item.feature, item.importance]);
  const thresholdPct = Math.round((detection?.threshold ?? 0.65) * 100);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Two-stage detector"
        title="Detection engine"
        description="Stage 1 is a behavioural activity gate. Stage 2 is a scikit-learn Random Forest inference over the seven window features."
        actions={(
          <Badge tone={!online ? "critical" : threat ? "critical" : detection?.evaluated ? "safe" : "neutral"} dot>
            {!online ? "BACKEND OFFLINE" : threat ? "RANSOMWARE-LIKE" : detection?.evaluated ? "BENIGN" : "AWAITING"}
          </Badge>
        )}
      />

      <div className="grid-2">
        <Card title="Stage 1 · Behavioural activity gate" subtitle="Suppresses calm windows before classification" icon={ShieldAlert}>
          <div className="rule-list">
            {[
              ["Feature window", "Events observed in the current window", online ? live?.event_count ?? 0 : "—"],
              ["Activity burst gate", `Writes + renames + deletes must reach ${state?.burst_gate_min ?? 8}/s`, online ? `${live?.burst_rate ?? 0}/s` : "—"],
              ["Risk threshold", "Random Forest probability needed for a threat verdict", online ? `${thresholdPct}%` : "—"],
              ["Gate state", "A closed gate is normal during quiet periods", online ? (live?.gate_open ? "OPEN" : "CLOSED") : "—"],
            ].map(([label, detail, value]) => (
              <div className="rule" key={label}>
                <div><b>{label}</b><small>{detail}</small></div>
                <Badge tone={label === "Gate state" ? (value === "OPEN" ? "critical" : "safe") : "info"}>{value}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Stage 2 · Random Forest inference" subtitle="Live probability for the current feature window" icon={BrainCircuit}>
          <div className="rf">
            <div className="rf-score">
              <div className="big-score" data-band={scoreBand(live?.live_score, thresholdPct)}>
                {online ? live?.live_score ?? 0 : "—"}<span>%</span>
              </div>
              <small>Live ransomware probability</small>
              <div className="meter" aria-hidden="true">
                <span
                  className={scoreBand(live?.live_score, thresholdPct)}
                  style={{ width: `${Math.min(Number(live?.live_score || 0), 100)}%` }}
                />
              </div>
            </div>
            <div className="feature-bars">
              {bars.length ? bars.slice(0, 5).map(([name, value]) => (
                <div key={name}>
                  <div><span>{humanize(name)}</span><b>{Math.round(value * 100)}%</b></div>
                  <div className="bar"><span style={{ width: `${Math.round(value * 100)}%` }} /></div>
                </div>
              )) : <Empty online={online} status={status} />}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Final decision logic" subtitle="The recorded verdict is latched across every view" icon={LockKeyhole}>
        <div className="decision-flow">
          <div>
            <span>STAGE 1</span>
            <b>{online ? (live?.gate_open ? "GATE OPEN" : "GATE CLOSED") : "—"}</b>
          </div>
          <span className="decision-op" aria-hidden="true">+</span>
          <div>
            <span>STAGE 2</span>
            <b>{online ? `${live?.live_score ?? 0}%` : "—"}</b>
          </div>
          <span className="decision-op" aria-hidden="true">→</span>
          <div className={threat ? "final-threat" : ""}>
            <span>{online ? (threat ? "RANSOMWARE-LIKE" : "BENIGN / LOW RISK") : "NO DATA"}</span>
            <b>{online ? (threat ? "CONTAIN" : "MONITOR") : "OFFLINE"}</b>
          </div>
        </div>
        <div className="score-row">
          <div><small>Recorded score</small><strong>{online && detection?.evaluated ? `${detection.score}%` : "—"}</strong></div>
          <div><small>Confidence in verdict</small><strong>{online && detection?.evaluated ? `${detection.confidence ?? 0}%` : "—"}</strong></div>
          <div><small>Recorded at</small><strong>{online ? detection?.decided_at || "—" : "—"}</strong></div>
        </div>
        <p className="detection-note">
          {online
            ? `The recorded verdict is latched so every page shows the same decision. ${detection?.reason || ""}`
            : "No telemetry available while the backend is unreachable."}
        </p>
      </Card>
    </div>
  );
}

function Alerts({ online, status, events, detection, state }) {
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const alerts = events.filter(event => event.severity === "CRITICAL" || event.severity === "HIGH");
  const contained = Boolean(state?.response);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = alerts.filter(event => {
    const severityMatch = severityFilter === "ALL" || event.severity === severityFilter;
    const queryMatch = !normalizedQuery || [
      event.host, event.detail, event.process, baseName(event.path), event.time,
    ].some(value => String(value || "").toLowerCase().includes(normalizedQuery));
    return severityMatch && queryMatch;
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow="Alert center"
        title="Security alerts"
        description="High and critical severity events raised by the lab sensor, presented with the real response state."
        actions={<Badge tone={alerts.length ? "warning" : "safe"} dot>{online ? `${alerts.length} alert${alerts.length === 1 ? "" : "s"}` : "BACKEND OFFLINE"}</Badge>}
      />

      <div className="toolbar">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search alerts</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search endpoint, process or file"
          />
        </label>
        <label className="select-field">
          <Filter size={14} aria-hidden="true" />
          <span className="sr-only">Filter alerts by severity</span>
          <select value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}>
            <option value="ALL">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
          </select>
        </label>
        <span className="toolbar-count">{filtered.length} of {alerts.length} shown</span>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <caption className="sr-only">High and critical security alerts</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Endpoint</th>
                <th scope="col">Alert</th>
                <th scope="col">Observed file</th>
                <th scope="col">Process</th>
                <th scope="col">Severity</th>
                <th scope="col">Response state</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.slice(0, 40).map((event, index) => (
                <tr key={`${event.epoch}-${index}`}>
                  <td className="mono">{event.time}</td>
                  <td><b>{event.host}</b></td>
                  <td>{event.detail}</td>
                  <td className="mono">{baseName(event.path)}</td>
                  <td className="mono">{event.process}</td>
                  <td><Badge tone={severityTone(event.severity)} dot>{event.severity}</Badge></td>
                  <td><Badge tone={contained ? "safe" : "info"} dot>{contained ? "CONTAINED" : "MONITORING"}</Badge></td>
                </tr>
              )) : <Empty online={online} status={status} colSpan={7} />}
            </tbody>
          </table>
        </div>
      </div>

      <p className="detection-note page-note">
        {online
          ? `Verdict on record: ${humanize(detection?.label) || "—"} · ${detection?.evaluated ? `${detection.score}%` : "—"} · ${detection?.risk_level || "—"} risk, decided at ${detection?.decided_at || "—"}.`
          : "No telemetry available while the backend is unreachable."}
      </p>
    </div>
  );
}

function Incidents({ online, status, state, stats }) {
  const incidents = state?.incidents || [];
  const openCount = incidents.filter(incident => incident.status === "OPEN").length;
  const closedCount = incidents.filter(incident => incident.status === "CLOSED").length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Case management"
        title="Incidents"
        description="Detection-to-containment records produced by the current safe-lab session."
        actions={(
          <>
            <Badge tone={stats.openIncident ? "critical" : "safe"} dot>
              {online ? (stats.openIncident ? "INCIDENT OPEN" : "NO OPEN INCIDENT") : "BACKEND OFFLINE"}
            </Badge>
            {online && <span className="summary-chip">{openCount} open · {closedCount} closed</span>}
          </>
        )}
      />

      {incidents.length ? (
        <div className="incident-cards">
          {incidents.map(incident => {
            const detail = incident.detection || {};
            return (
              <article className={`incident-card ${incident.status === "OPEN" ? "is-open" : ""}`} key={incident.id}>
                <div className="incident-head">
                  <span className="incident-id">{incident.id}</span>
                  <StatusBadge status={incident.status} />
                </div>
                <h3>{detail.label === "RANSOMWARE_LIKE" ? "Ransomware-like behaviour" : "Behavioural alert"}</h3>
                <p className="incident-subtitle">
                  {incident.endpoint} · score {detail.score ?? "—"}% · {detail.risk_level || "—"} risk
                </p>
                <div className="incident-meta">
                  <span><small>Opened</small><b>{incident.opened_at}</b></span>
                  <span><small>Window</small><b>{detail.window_seconds ?? "—"}s</b></span>
                  <span><small>Events</small><b>{detail.features?.event_count ?? 0}</b></span>
                  <span><small>Evidence</small><b>{incident.response?.evidence_preserved ? "CAPTURED" : "—"}</b></span>
                  <span><small>Network</small><b>{humanize(incident.response?.network_isolation || "—")}</b></span>
                  <span><small>Process</small><b>{humanize(incident.response?.process_termination || "—")}</b></span>
                </div>
                {incident.closed_reason && <p className="incident-closed">{incident.closed_reason}</p>}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card empty-card">
          <Empty online={online} status={status} title="No incidents in this session" description="Run the safe detection workflow to generate a laboratory incident." />
        </div>
      )}
    </div>
  );
}

function Evidence({ online, status, events, state, simulator }) {
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = events.filter(event => {
    const typeMatch = typeFilter === "ALL" || event.type === typeFilter;
    const queryMatch = !normalizedQuery || [
      baseName(event.path), event.process, event.detail, event.time,
    ].some(value => String(value || "").toLowerCase().includes(normalizedQuery));
    return typeMatch && queryMatch;
  });
  const writes = events.filter(event => event.type === "FILE_WRITE").length;
  const lastEvent = events[0]?.time || "—";

  return (
    <div className="page">
      <PageHeader
        eyebrow="Forensic evidence"
        title="Evidence explorer"
        description="Raw filesystem telemetry captured by the safe laboratory sensor, exactly as observed."
        actions={<Badge tone={online ? "info" : "critical"} dot>{online ? `${events.length} captured events` : "BACKEND OFFLINE"}</Badge>}
      />

      <div className="score-row evidence-summary">
        <div><small>Capture source</small><strong className="small-strong">Isolated lab sandbox</strong></div>
        <div><small>Simulator PID</small><strong>{simulator?.running ? simulator.pid : "not running"}</strong></div>
        <div><small>Simulator stage</small><strong>{simulator?.running ? simulator.phase_label : simulator?.phase_label || "—"}</strong></div>
        <div><small>Write observations</small><strong>{online ? writes : "—"}</strong></div>
        <div><small>Last observed</small><strong>{online ? lastEvent : "—"}</strong></div>
      </div>

      <div className="toolbar">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search evidence</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search file, process or detail"
          />
        </label>
        <label className="select-field">
          <Filter size={14} aria-hidden="true" />
          <span className="sr-only">Filter evidence by operation</span>
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
            <option value="ALL">All operations</option>
            <option value="FILE_WRITE">Writes</option>
            <option value="FILE_RENAME">Renames</option>
            <option value="FILE_DELETE">Deletes</option>
            <option value="FILE_CREATE">Creates</option>
          </select>
        </label>
        <span className="toolbar-count">{filtered.length} of {events.length} shown</span>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Captured filesystem evidence events</caption>
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Operation</th>
                <th scope="col">Process</th>
                <th scope="col">Observed file</th>
                <th scope="col">Entropy Δ</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.slice(0, 60).map((event, index) => (
                <tr key={`${event.epoch}-${index}`}>
                  <td className="mono">{event.time}</td>
                  <td><Badge tone="info">{humanize(event.type)}</Badge></td>
                  <td className="mono">{event.process}</td>
                  <td className="mono" title={baseName(event.path)}>{baseName(event.path)}</td>
                  <td className="mono">{event.type === "FILE_WRITE" ? event.value : "—"}</td>
                  <td>{event.detail}</td>
                </tr>
              )) : <Empty online={online} status={status} colSpan={6} />}
            </tbody>
          </table>
        </div>
      </div>

      <ReliabilityBanner title="Evidence handling" tone="info" icon={LockKeyhole}>
        Only file names from the isolated lab sandbox are shown. No user files, credentials or host paths are exposed by this interface.
      </ReliabilityBanner>
    </div>
  );
}

function Response({ online, status, state, detection, stats }) {
  const response = state?.response;
  const host = state?.endpoint_id;
  const closed = (state?.incidents || []).filter(incident => incident.status === "CLOSED");
  const steps = buildResponseSteps({
    online, detection, response, openIncident: stats.openIncident,
  });
  const containmentTone = !online ? "neutral" : response ? "contained" : "monitoring";

  return (
    <div className="page">
      <PageHeader
        eyebrow="Containment"
        title="Automated response"
        description="Safe response orchestrator state for the authorized isolated laboratory endpoint."
        actions={(
          <Badge tone={!online ? "critical" : response ? "safe" : "info"} dot>
            {!online ? "BACKEND OFFLINE" : response ? "SIMULATED CONTAINMENT ACTIVE" : "MONITORING"}
          </Badge>
        )}
      />

      <div className="grid-2">
        <Card title="Response timeline" subtitle="Every stage is derived from the backend response record" icon={Zap}>
          <Workflow steps={steps} />
        </Card>

        <Card title="Containment status" subtitle="Simulation-only response state" icon={WifiOff}>
          <div className={`containment ${containmentTone}`}>
            <div className="containment-icon">
              {online && response ? <ShieldCheck size={32} aria-hidden="true" /> : <Shield size={32} aria-hidden="true" />}
            </div>
            <h2>{!online ? "Backend offline" : response ? "Safe-lab containment active" : "Monitoring"}</h2>
            <p>
              {!online
                ? "No containment state is reported while the backend is unreachable."
                : response
                  ? `${host} is recorded as ${humanize(response.network_isolation)} in safe simulation mode. No real host was isolated.`
                  : `${host || "The lab endpoint"} is currently being monitored.`}
            </p>
            <div className="containment-grid">
              <span><small>Process response</small><b>{response?.process_termination || "NOT TRIGGERED"}</b></span>
              <span><small>Network</small><b>{response?.network_isolation || "NOT TRIGGERED"}</b></span>
              <span><small>Evidence</small><b>{response?.evidence_preserved ? "CAPTURED" : "WAITING"}</b></span>
              <span><small>Mode</small><b>{response?.mode || "SAFE_LAB_SIMULATION"}</b></span>
              <span><small>Host changes</small><b>{response?.host_changes || "NONE"}</b></span>
              <span><small>Audit record</small><b>{response?.audit ? (response.audit.recorded ? "RECORDED" : "FAILED") : "PENDING"}</b></span>
            </div>
            {response?.note && <p className="containment-note">{response.note}</p>}
          </div>
        </Card>
      </div>

      {closed.length > 0 && (
        <Card title="Released incidents" subtitle="Incidents closed after the configured inactivity hold" icon={Siren}>
          <div className="table-card table-card-inset">
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Released incidents</caption>
                <thead>
                  <tr>
                    <th scope="col">Incident</th>
                    <th scope="col">Opened</th>
                    <th scope="col">Closed</th>
                    <th scope="col">Score</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {closed.map(incident => (
                    <tr key={incident.id}>
                      <td className="mono">{incident.id}</td>
                      <td className="mono">{incident.opened_at}</td>
                      <td className="mono">{incident.closed_at}</td>
                      <td>{incident.detection?.score ?? "—"}%</td>
                      <td>{incident.closed_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Analytics({ online, status, history, state, detection }) {
  const model = state?.model;
  const metrics = model?.metrics;
  const importance = model?.feature_importance || [];
  const thresholdPct = Math.round((detection?.threshold ?? 0.65) * 100);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Model analytics"
        title="Random Forest analytics"
        description="Prototype validation on synthetic laboratory behavioural traces generated by the backend. These are not real-world ransomware benchmark results."
        actions={<Badge tone="warning" dot>SYNTHETIC LAB DATA</Badge>}
      />

      <div className="kpis">
        <MetricCard label="Algorithm" value={online ? model?.algorithm || "—" : "—"} description="Behavioural classifier" icon={BrainCircuit} tone="blue" />
        <MetricCard label="Accuracy" value={online && metrics ? `${(metrics.accuracy * 100).toFixed(1)}%` : "—"} description="Held-out synthetic set" icon={Gauge} tone="green" />
        <MetricCard label="Precision" value={online && metrics ? `${(metrics.precision * 100).toFixed(1)}%` : "—"} description="Positive predictive value" icon={Gauge} tone="cyan" />
        <MetricCard label="Recall" value={online && metrics ? `${(metrics.recall * 100).toFixed(1)}%` : "—"} description="Detection sensitivity" icon={Gauge} tone="amber" />
        <MetricCard label="F1 score" value={online && metrics ? `${(metrics.f1 * 100).toFixed(1)}%` : "—"} description="Harmonic mean" icon={Gauge} tone="purple" />
        <MetricCard label="Training samples" value={online && metrics ? metrics.samples : "—"} description="Synthetic behavioural traces" icon={Database} tone="red" />
      </div>

      <p className="detection-note page-note">
        {online
          ? `The same model produced the recorded verdict: ${humanize(detection?.label) || "—"} at ${detection?.evaluated ? `${detection.score}%` : "—"} · ${detection?.risk_level || "—"} risk. The chart is per-window live output; the recorded verdict is latched.`
          : "No telemetry available while the backend is unreachable."}
      </p>

      <div className="grid-2">
        <Card title="Live ransomware probability over time" subtitle={`Rolling ${history.length}-sample view from /api/state`} icon={Activity}>
          <div className="chart-wrap">
            {history.length > 1 ? (
              <div role="img" aria-label="Area chart of live ransomware probability over time">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={history} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="probabilityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5b9dff" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#5b9dff" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#19273d" strokeDasharray="2 6" vertical={false} />
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "#8494ab", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "#22324a" }}
                      minTickGap={28}
                    />
                    <YAxis
                      domain={[0, 100]}
                      width={42}
                      tick={{ fill: "#8494ab", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={value => `${value}%`}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#3b5578", strokeDasharray: "3 4" }} />
                    {online && detection?.threshold != null && (
                      <ReferenceLine y={thresholdPct} stroke="#f2b84b" strokeDasharray="4 6" strokeOpacity={0.75} />
                    )}
                    <Area
                      type="monotone"
                      dataKey="live"
                      stroke="#5b9dff"
                      strokeWidth={2}
                      fill="url(#probabilityFill)"
                      name="Live probability %"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : online ? (
              <div className="chart-empty">
                <span className="empty-icon large"><Activity size={21} aria-hidden="true" /></span>
                <strong>Collecting live samples</strong>
                <p>The chart populates only from real backend evaluations. No sample history is fabricated.</p>
              </div>
            ) : (
              <ChartState online={online} status={status} />
            )}
          </div>
        </Card>

        <Card title="Feature importance" subtitle="Current model contribution" icon={BrainCircuit}>
          <div className="feature-bars big">
            {importance.length ? importance.map(item => {
              const percentage = `${Math.round((item.importance ?? 0) * 100)}%`;
              return (
                <div key={item.feature}>
                  <div><span>{humanize(item.feature)}</span><b>{percentage}</b></div>
                  <div className="bar"><span style={{ width: percentage }} /></div>
                </div>
              );
            }) : <Empty online={online} status={status} />}
          </div>
        </Card>
      </div>

      <ReliabilityBanner title="Research honesty" tone="warning" icon={AlertTriangle}>
        {online && metrics
          ? `Trained on ${metrics.samples} synthetic laboratory behavioural traces (${metrics.train_samples} train / ${metrics.test_samples} test) using ${metrics.n_estimators} trees at max depth ${metrics.max_depth}, scikit-learn ${model.sklearn_version}. Real endpoint telemetry and a labelled real-world dataset remain future work.`
          : "Model metrics load from the backend. Start the backend to see them."}
      </ReliabilityBanner>
    </div>
  );
}

function Sandbox({ online, status, state, simulator, runScenario, demoRunning, onRefresh, onReset, canOperate }) {
  const running = Boolean(simulator?.running);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Safe lab"
        title="Testing & sandbox"
        description="Run non-destructive simulated ransomware behaviours for dashboard demonstrations."
        actions={(
          <Badge tone={running ? "warning" : online ? "safe" : "critical"} dot>
            {running ? "SIMULATION RUNNING" : online ? "IDLE" : status === "connecting" ? "CONNECTING" : "BACKEND OFFLINE"}
          </Badge>
        )}
      />

      <ReliabilityBanner title="Safety boundary" tone="safe" icon={ShieldCheck}>
        This demo generates telemetry only. It does not encrypt files, deploy malware, steal credentials or attack networks.
      </ReliabilityBanner>

      {!canOperate && (
        <ReliabilityBanner title="Operator controls unavailable" tone="warning" icon={LockKeyhole}>
          Simulation, containment and reset controls are hidden in this read-only public demo. Live telemetry and detector output remain available.
        </ReliabilityBanner>
      )}

      <div className="grid-3">
        {[
          ["Lab directory", online ? "SCOPED" : "OFFLINE", "Isolated laboratory sandbox", Server, "safe"],
          ["Sensor agent", online ? (state?.sensor?.status || "ONLINE") : "OFFLINE", `Polling every 150 ms · ${state?.window_seconds ?? 3}s window`, Eye, online && state?.sensor?.status === "ONLINE" ? "safe" : "warning"],
          ["Simulator", running ? "RUNNING" : "IDLE", running ? `PID ${simulator.pid} · ${simulator.phase_label}` : "No simulation running", Network, running ? "warning" : "info"],
        ].map(([label, value, detail, Icon, tone]) => (
          <div className={`sandbox-card ${tone}`} key={label}>
            <span className="sandbox-icon"><Icon size={20} aria-hidden="true" /></span>
            <small>{label}</small>
            <h3>{value}</h3>
            <p>{detail}</p>
          </div>
        ))}
      </div>

      <Card title="Safe behavioural simulation" subtitle="Choose a scenario to stream synthetic lab telemetry" icon={Play}>
        {canOperate ? (
          <div className="sim-grid">
            {SCENARIOS.map(([id, title, detail], index) => (
              <button
                type="button"
                className="sim-btn"
                key={id}
                onClick={() => runScenario(id)}
                disabled={!online || running}
              >
                <span className="sim-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="sim-copy">
                  <b>{title}</b>
                  <small>{detail}</small>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <div className="locked-panel">
            <LockKeyhole size={24} aria-hidden="true" />
            <div>
              <b>Simulation controls are locked</b>
              <p>This interface is running as a read-only public demo. The backend enforces the same restriction on all state-changing endpoints.</p>
            </div>
          </div>
        )}
      </Card>

      <div className="sandbox-footer">
        <div className={`status-line ${running ? "is-active" : ""}`}>
          <span className={`status-dot ${running ? "warn" : online ? "ok" : "bad"}`} aria-hidden="true" />
          <span>Safe lab simulation {running ? "in progress" : "idle"}</span>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={!online}>
            <RefreshCw size={15} aria-hidden="true" /> Refresh state
          </button>
          {canOperate && (
            <button type="button" className="btn btn-danger" onClick={onReset} disabled={!online || running}>
              <RefreshCw size={15} aria-hidden="true" /> Reset lab
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Architecture({ state }) {
  const nodes = [
    ["Isolated lab files", "Disposable files inside the authorized laboratory sandbox", Server],
    ["Filesystem sensor", "Cross-platform polling sensor at a 150 ms interval", Eye],
    ["3-second feature window", "Write · rename · delete · create · extension · entropy · unique files", Activity],
    ["Two-stage detector", "Activity burst gate followed by Random Forest inference", BrainCircuit],
    ["Safe response orchestrator", "Simulated containment record plus incident log", Zap],
    ["SOC dashboard", "Live events · score · evidence · response state", LayoutDashboard],
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="System design"
        title="Architecture"
        description="The end-to-end flow that is actually implemented in this prototype."
      />

      <div className="architecture">
        {nodes.map(([label, detail, Icon], index) => (
          <React.Fragment key={label}>
            <div className={`arch-node ${index === 3 ? "focus" : ""}`}>
              <div className="arch-icon"><Icon size={20} aria-hidden="true" /></div>
              <div>
                <b>{label}</b>
                <span>{detail}</span>
              </div>
              <span className="arch-step">{String(index + 1).padStart(2, "0")}</span>
            </div>
            {index < nodes.length - 1 && <div className="arch-arrow" aria-hidden="true">↓</div>}
          </React.Fragment>
        ))}
      </div>

      <ReliabilityBanner title="Deployment boundary" tone="info" icon={LockKeyhole}>
        The simulator is confined to the backend's isolated laboratory sandbox. The response orchestrator only records simulated containment and never changes host networking or terminates third-party processes.
      </ReliabilityBanner>

      <ReliabilityBanner title="Not implemented in this prototype" tone="warning" icon={AlertTriangle}>
        Windows Sysmon collection, real NIC or firewall isolation, process-tree termination, canary file monitoring, multi-endpoint agents and a real-world labelled dataset are future work. The dashboard reports only what this backend actually observes.
      </ReliabilityBanner>
    </div>
  );
}

function Settings({ state, online }) {
  const settingsGroups = [
    {
      title: "Detection",
      items: [
        ["Detection window", online ? `${state?.window_seconds ?? "—"} seconds` : "—", "Feature aggregation window"],
        ["Activity gate", online ? `Enabled · ${state?.burst_gate_min ?? "—"}/s minimum` : "—", "Write + rename + delete burst rate"],
        ["Risk threshold", online ? `${Math.round((state?.risk_threshold ?? 0) * 100)}%` : "—", "Random Forest probability for a threat verdict"],
        ["Incident hold", online ? `${state?.incident_hold_seconds ?? "—"} seconds` : "—", "Idle time before a lab incident is released"],
      ],
    },
    {
      title: "Model",
      items: [
        ["ML detector", online ? state?.model?.algorithm || "—" : "—", `${state?.model?.metrics?.features?.length ?? 7}-feature behavioural classifier`],
        ["Data source", online ? state?.model?.metrics?.dataset_type || "Synthetic lab traces" : "—", "Prototype training and validation only"],
        ["Estimators", online ? state?.model?.n_estimators ?? "—" : "—", "Random Forest trees in the current model"],
        ["Model risk", online ? state?.model?.status || "prototype" : "—", "Reported by the backend model artifact"],
      ],
    },
    {
      title: "Environment",
      items: [
        ["Endpoint", online ? state?.endpoint_id || "—" : "—", "Single authorized safe laboratory host"],
        ["Response mode", "Simulation only", "No host networking changes, no process termination"],
        ["Telemetry source", "/api/state", "Single source of truth for every page"],
        ["Deployment mode", "Safe lab", "Isolated, non-destructive laboratory prototype"],
      ],
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="System configuration"
        title="Settings"
        description="Live detector configuration reported by the backend, plus the fixed safety boundaries of this prototype."
        actions={<Badge tone={online ? "safe" : "critical"} dot>{online ? "CONFIGURATION LIVE" : "BACKEND OFFLINE"}</Badge>}
      />

      {settingsGroups.map(group => (
        <section className="settings-section" key={group.title}>
          <div className="settings-section-head">
            <h2>{group.title}</h2>
            <span>{group.items.length} parameters</span>
          </div>
          <div className="settings-grid">
            {group.items.map(([label, value, detail]) => (
              <div className="setting" key={label}>
                <div>
                  <b>{label}</b>
                  <small>{detail}</small>
                </div>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
