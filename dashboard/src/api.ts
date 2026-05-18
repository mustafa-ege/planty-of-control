import type { Command, DeviceRow, LatestSnapshot, TelemetryPoint } from "./types";

const json = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return res.json() as Promise<T>;
};

export async function fetchDevices(): Promise<DeviceRow[]> {
  return json(await fetch("/api/devices"));
}

export async function fetchLatest(deviceId: string): Promise<LatestSnapshot> {
  return json(await fetch(`/api/devices/${encodeURIComponent(deviceId)}/latest`));
}

export async function fetchTelemetry(deviceId: string, limit = 120): Promise<TelemetryPoint[]> {
  const rows = await json<TelemetryPoint[]>(
    await fetch(`/api/devices/${encodeURIComponent(deviceId)}/telemetry?limit=${limit}`)
  );
  return rows.slice().reverse();
}

export async function sendCommand(deviceId: string, command: Command): Promise<{ ok: boolean; cmdId: string }> {
  return json(
    await fetch(`/api/devices/${encodeURIComponent(deviceId)}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command)
    })
  );
}

export function newCmdId(): string {
  return `cmd_ui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
