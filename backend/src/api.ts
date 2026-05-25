import express from "express";
import type { Db } from "./db.js";
import { CommandSchema, type Command } from "./schemas.js";

export type PublishCommand = (deviceId: string, command: Command) => Promise<{ cmdId: string }>;

export function createApi(db: Db, publishCommand: PublishCommand) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/devices", (_req, res) => {
    const rows = db
      .prepare(
        `select deviceId, lastSeenTs, lastTelemetryTs, lastStateTs, online
         from devices
         order by deviceId asc`
      )
      .all();
    res.json(
      rows.map((r: any) => ({
        deviceId: r.deviceId,
        lastSeenTs: r.lastSeenTs,
        lastTelemetryTs: r.lastTelemetryTs ?? null,
        lastStateTs: r.lastStateTs ?? null,
        online: Boolean(r.online)
      }))
    );
  });

  app.get("/api/devices/:id/latest", (req, res) => {
    const deviceId = req.params.id;

const telemetry = (db
      .prepare(
        `select ts, seq, tempC, humidityPct, soilRaw, soilPct, waterLevelPct, lightPct, rssi, vbat, gpsLat, gpsLon, gpsHdop
         from telemetry
         where deviceId = ?
         order by ts desc
         limit 1`
      )
      .get(deviceId) ?? null) as any;

    const state = (db
      .prepare(
        `select ts, pumpOn, fanOn, mode, lastCmdId
         from device_state
         where deviceId = ?`
      )
      .get(deviceId) ?? null) as any;

    res.json({
      deviceId,
      telemetry: telemetry
        ? {
            ts: telemetry.ts,
            seq: telemetry.seq,
            tempC: telemetry.tempC,
            humidityPct: telemetry.humidityPct,
            soilRaw: telemetry.soilRaw,
            soilPct: telemetry.soilPct,
            waterLevelPct: telemetry.waterLevelPct,
            lightPct: telemetry.lightPct,
            rssi: telemetry.rssi,
            vbat: telemetry.vbat,
            gps:
              telemetry.gpsLat != null && telemetry.gpsLon != null
                ? { lat: telemetry.gpsLat, lon: telemetry.gpsLon, hdop: telemetry.gpsHdop }
                : null
          }
        : null,
      state: state
        ? {
            ts: state.ts,
            pumpOn: Boolean(state.pumpOn),
            fanOn: Boolean(state.fanOn),
            mode: state.mode,
            lastCmdId: state.lastCmdId ?? null
          }
        : null
    });
  });

  app.get("/api/devices/:id/telemetry", (req, res) => {
    const deviceId = req.params.id;
    const limit = Math.min(Number(req.query.limit ?? 300), 5000);

  const rows = db
      .prepare(
        `select ts, seq, tempC, humidityPct, soilRaw, soilPct, waterLevelPct, lightPct, rssi, vbat, gpsLat, gpsLon, gpsHdop
         from telemetry
         where deviceId = ?
         order by ts desc
         limit ?`
      )
      .all(deviceId, limit);

    res.json(rows);
  });

  // Command submission endpoint.
  app.post("/api/devices/:id/commands", async (req, res) => {
    const parsed = CommandSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid command", details: parsed.error.flatten() });
      return;
    }

    const deviceId = req.params.id;
    const { cmdId } = await publishCommand(deviceId, parsed.data);
    res.json({ ok: true, cmdId });
  });

  return app;
}
