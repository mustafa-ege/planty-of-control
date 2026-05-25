export type DeviceRow = {
  deviceId: string;
  lastSeenTs: number;
  lastTelemetryTs: number | null;
  lastStateTs: number | null;
  online: boolean;
};

export type TelemetryPoint = {
  ts: number;
  seq: number;
  tempC: number | null;
  humidityPct: number | null;
  soilRaw: number;
  soilPct: number;
  waterLevelPct: number | null;
  lightPct: number | null;
  rssi: number | null;
  compatibilityScore?: number;
};

export type DeviceState = {
  ts: number;
  pumpOn: boolean;
  fanOn: boolean;
  mode: "auto" | "manual";
  lastCmdId: string | null;
};

export type LatestSnapshot = {
  deviceId: string;
  telemetry: TelemetryPoint | null;
  state: DeviceState | null;
};

export type RealtimeEvent =
  | { type: "telemetry"; deviceId: string; data: TelemetryPoint & { deviceId?: string } }
  | { type: "state"; deviceId: string; data: DeviceState & { deviceId?: string } }
  | { type: "availability"; deviceId: string; data: { online?: boolean; ts?: number } };

export type PumpCommand = {
  cmdId: string;
  ts: number;
  type: "pump";
  on: boolean;
  durationMs?: number | null;
};

export type FanCommand = {
  cmdId: string;
  ts: number;
  type: "fan";
  on: boolean;
  durationMs?: number | null;
};

export type SetModeCommand = {
  cmdId: string;
  ts: number;
  type: "setMode";
  mode: "auto" | "manual";
};

export type StopAllCommand = {
  cmdId: string;
  ts: number;
  type: "stopAll";
};

export type Command = PumpCommand | FanCommand | SetModeCommand | StopAllCommand;
