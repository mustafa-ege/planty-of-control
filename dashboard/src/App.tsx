import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { usePlantyDashboard, OFFLINE_AFTER_MS } from "./hooks/usePlantyDashboard";

const DEFAULT_DEVICE = "esp32-001";

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

function fmtNum(v: number | null | undefined, suffix = "") {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)}${suffix}`;
}

export default function App() {
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE);
  const {
    devices,
    latest,
    history,
    wsConnected,
    error,
    commandStatus,
    isOffline,
    pump,
    fan,
    setMode,
    stopAll,
    refresh
  } = usePlantyDashboard(deviceId);

  const t = latest?.telemetry;
  const s = latest?.state;

  const chartData = history.map((p) => ({
    time: fmtTime(p.ts),
    soilPct: p.soilPct,
    humidityPct: p.humidityPct,
    tempC: p.tempC
  }));

  const deviceOptions =
    devices.length > 0
      ? devices
      : [
          {
            deviceId: DEFAULT_DEVICE,
            lastSeenTs: 0,
            lastTelemetryTs: null,
            lastStateTs: null,
            online: false
          }
        ];

  return (
    <div className="app">
      <header>
        <div>
          <h1>PlantyOfControl</h1>
          <p className="status-line">Home plant monitoring dashboard</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} aria-label="Device">
            {deviceOptions.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.deviceId}
              </option>
            ))}
          </select>
          <span className={`badge ${isOffline ? "offline" : "online"}`}>
            {isOffline ? "Offline" : "Online"}
          </span>
          <span className="badge ws">{wsConnected ? "Live WS" : "Polling"}</span>
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      {isOffline && (
        <div className="alert">
          No telemetry for {OFFLINE_AFTER_MS / 1000}s — device may be disconnected or not publishing.
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      <section className="grid">
        <div className="card">
          <h2>Temperature</h2>
          <div className="metric">{fmtNum(t?.tempC, "°C")}</div>
        </div>
        <div className="card">
          <h2>Humidity</h2>
          <div className="metric">{fmtNum(t?.humidityPct, "%")}</div>
        </div>
        <div className="card">
          <h2>Soil moisture</h2>
          <div className="metric">{fmtNum(t?.soilPct, "%")}</div>
        </div>
        <div className="card">
          <h2>Water level</h2>
          <div className="metric">{fmtNum(t?.waterLevelPct, "%")}</div>
        </div>
        <div className="card">
          <h2>Light</h2>
          <div className="metric">{fmtNum(t?.lightPct, "%")}</div>
        </div>
        <div className="card">
          <h2>Actuators</h2>
          <p className="status-line">
            Pump: {s?.pumpOn ? "ON" : "off"} · Fan: {s?.fanOn ? "ON" : "off"} · Mode: {s?.mode ?? "—"}
          </p>
          {s?.lastCmdId && <p className="status-line">Last cmd: {s.lastCmdId}</p>}
        </div>
      </section>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <h2>History</h2>
        <div className="chart-wrap">
          {chartData.length < 2 ? (
            <p className="status-line">Waiting for telemetry…</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="soilPct" name="Soil %" stroke="#40916c" dot={false} />
                <Line type="monotone" dataKey="humidityPct" name="Humidity %" stroke="#277da1" dot={false} />
                <Line type="monotone" dataKey="tempC" name="Temp °C" stroke="#e76f51" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Controls</h2>
        <div className="controls">
          <button type="button" className="primary" disabled={isOffline} onClick={() => void pump(true, 1500)}>
            Water 1.5s
          </button>
          <button type="button" disabled={isOffline} onClick={() => void pump(false)}>
            Pump off
          </button>
          <button type="button" className="primary" disabled={isOffline} onClick={() => void fan(true, 5000)}>
            Fan 5s
          </button>
          <button type="button" disabled={isOffline} onClick={() => void fan(false)}>
            Fan off
          </button>
          <button type="button" disabled={isOffline} onClick={() => void setMode("auto")}>
            Auto mode
          </button>
          <button type="button" disabled={isOffline} onClick={() => void setMode("manual")}>
            Manual mode
          </button>
          <button type="button" className="danger" disabled={isOffline} onClick={() => void stopAll()}>
            Stop all
          </button>
        </div>
        {commandStatus && <p className="status-line">{commandStatus}</p>}
        {t && <p className="status-line">Last update: {fmtTime(t.ts)}</p>}
      </section>
    </div>
  );
}
