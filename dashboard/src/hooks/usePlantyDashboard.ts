import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDevices, fetchLatest, fetchTelemetry, sendCommand, newCmdId } from "../api";
import type {
  Command,
  DeviceRow,
  DeviceState,
  LatestSnapshot,
  RealtimeEvent,
  TelemetryPoint
} from "../types";

export const OFFLINE_AFTER_MS = 30_000;
const POLL_MS = 5_000;

export function usePlantyDashboard(deviceId: string) {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [latest, setLatest] = useState<LatestSnapshot | null>(null);
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  const [lastHeardAt, setLastHeardAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [devs, snap, series] = await Promise.all([
        fetchDevices(),
        fetchLatest(deviceId),
        fetchTelemetry(deviceId, 120)
      ]);
      setDevices(devs);
      setLatest(snap);
      setHistory(series);
      const row = devs.find((d) => d.deviceId === deviceId);
      if (row?.lastTelemetryTs) setLastHeardAt(row.lastTelemetryTs);
      else if (snap.telemetry) setLastHeardAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    }
  }, [deviceId]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as RealtimeEvent;
        if (msg.deviceId !== deviceId) return;

        if (msg.type === "telemetry") {
          const t = msg.data as TelemetryPoint;
          setLastHeardAt(Date.now());
          setLatest((prev) => ({
            deviceId,
            telemetry: {
              ts: t.ts,
              seq: t.seq ?? 0,
              tempC: t.tempC ?? null,
              humidityPct: t.humidityPct ?? null,
              soilRaw: t.soilRaw ?? 0,
              soilPct: t.soilPct ?? 0,
              waterLevelPct: t.waterLevelPct ?? null,
              lightPct: t.lightPct ?? null,
              rssi: t.rssi ?? null,
              compatibilityScore: t.compatibilityScore
            },
            state: prev?.state ?? null
          }));
          setHistory((prev) => {
            const next = [...prev, t as TelemetryPoint];
            return next.length > 120 ? next.slice(-120) : next;
          });
        } else if (msg.type === "state") {
          const s = msg.data as DeviceState;
          setLatest((prev) => ({
            deviceId,
            telemetry: prev?.telemetry ?? null,
            state: {
              ts: s.ts,
              pumpOn: s.pumpOn,
              fanOn: s.fanOn,
              mode: s.mode,
              lastCmdId: s.lastCmdId ?? null
            }
          }));
        }
      } catch {
        /* ignore malformed */
      }
    };

    return () => ws.close();
  }, [deviceId]);

  const deviceRow = useMemo(
    () => devices.find((d) => d.deviceId === deviceId),
    [devices, deviceId]
  );

  const isOffline = useMemo(() => {
    const heard = lastHeardAt ?? deviceRow?.lastTelemetryTs ?? null;
    if (heard == null) return true;
    return Date.now() - heard > OFFLINE_AFTER_MS;
  }, [lastHeardAt, deviceRow?.lastTelemetryTs]);

  const postCommand = useCallback(
    async (command: Command) => {
      setCommandStatus("Sending…");
      try {
        const res = await sendCommand(deviceId, command);
        setCommandStatus(`Sent ${res.cmdId}`);
        await refresh();
      } catch (e) {
        setCommandStatus(e instanceof Error ? e.message : "Command failed");
      }
    },
    [deviceId, refresh]
  );

  const pump = useCallback(
    (on: boolean, durationMs = 1500) =>
      postCommand({
        cmdId: newCmdId(),
        ts: Date.now(),
        type: "pump",
        on,
        durationMs: on ? durationMs : null
      }),
    [postCommand]
  );

  const fan = useCallback(
    (on: boolean, durationMs = 5000) =>
      postCommand({
        cmdId: newCmdId(),
        ts: Date.now(),
        type: "fan",
        on,
        durationMs: on ? durationMs : null
      }),
    [postCommand]
  );

  const setMode = useCallback(
    (mode: "auto" | "manual") =>
      postCommand({ cmdId: newCmdId(), ts: Date.now(), type: "setMode", mode }),
    [postCommand]
  );

  const stopAll = useCallback(
    () => postCommand({ cmdId: newCmdId(), ts: Date.now(), type: "stopAll" }),
    [postCommand]
  );

  return {
    devices,
    latest,
    history,
    wsConnected,
    error,
    commandStatus,
    isOffline,
    deviceRow,
    refresh,
    pump,
    fan,
    setMode,
    stopAll
  };
}
