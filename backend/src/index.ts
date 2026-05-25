import http from "node:http";
import { nanoid } from "nanoid";

import { env } from "./env.js";
import { openDb, initDb } from "./db.js";
import { connectMqtt, topicsFromEnv } from "./mqtt.js";
import { createRealtime } from "./realtime.js";
import { createApi } from "./api.js";
import { DeviceStateSchema, TelemetrySchema, type Command } from "./schemas.js";

function calculateBestCompatibility(db: any, tempC?: number | null, humidityPct?: number | null, soilPct?: number | null, lightPct?: number | null): number {
  const profiles = db.prepare('select * from plant_profiles').all();
  if (!profiles || profiles.length === 0) return 50;

  let bestScore = -1;
  let bestPlant = "";

  for (const p of profiles) {
    let currentScore = 100;

    // Eğer değer aralığın dışındaysa (min/max), aralığa olan uzaklığa göre puan kırıyoruz
    if (tempC != null) {
      if (tempC < p.idealTempMin) currentScore -= (p.idealTempMin - tempC) * 2;
      else if (tempC > p.idealTempMax) currentScore -= (tempC - p.idealTempMax) * 2;
    }
    if (humidityPct != null) {
      if (humidityPct < p.idealHumidityMin) currentScore -= (p.idealHumidityMin - humidityPct);
      else if (humidityPct > p.idealHumidityMax) currentScore -= (humidityPct - p.idealHumidityMax);
    }
    if (soilPct != null) {
      if (soilPct < p.idealSoilMin) currentScore -= (p.idealSoilMin - soilPct);
      else if (soilPct > p.idealSoilMax) currentScore -= (soilPct - p.idealSoilMax);
    }
    // Işık oranını da hesaba katıyoruz
    if (lightPct != null) {
      if (lightPct < p.idealLightMin) currentScore -= (p.idealLightMin - lightPct);
      else if (lightPct > p.idealLightMax) currentScore -= (lightPct - p.idealLightMax);
    }

    currentScore = Math.max(0, Math.min(100, currentScore));
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestPlant = p.name;
    }
  }

  // Terminalde anlık takip edebilmek için log atıyoruz
  console.log(`[Compatibility] En uygun bitki: ${bestPlant} (Skor: ${Math.round(bestScore)})`);
  return Math.round(bestScore);
}

function upsertDevice(db: any, deviceId: string, now: number) {
  db.prepare(
    `insert into devices(deviceId, lastSeenTs, lastTelemetryTs, lastStateTs, online)
     values(?, ?, null, null, 0)
     on conflict(deviceId) do update set lastSeenTs = excluded.lastSeenTs`
  ).run(deviceId, now);
}

function setDeviceOnline(db: any, deviceId: string, online: boolean, now: number) {
  upsertDevice(db, deviceId, now);
  db.prepare(`update devices set online = ?, lastSeenTs = ? where deviceId = ?`).run(online ? 1 : 0, now, deviceId);
}

async function main() {
  const db = openDb();
  initDb(db);

  const mqttClient = connectMqtt();
  const t = topicsFromEnv();

  const publishCommand = async (deviceId: string, command: Command): Promise<{ cmdId: string }> => {
    const cmdId = command.cmdId || `cmd_${nanoid(16)}`;
    const toPublish = { ...command, cmdId };
    const payload = JSON.stringify(toPublish);

    await new Promise<void>((resolve) => {
      mqttClient.publish(t.cmdTopic(deviceId), payload, { qos: 1, retain: false }, (err) => {
        const publishedAt = Date.now();
        if (!err) {
          // command_log references devices(deviceId); ensure row exists even if no telemetry yet
          upsertDevice(db, deviceId, publishedAt);
          try {
            db.prepare(
              `insert into command_log(cmdId, deviceId, ts, type, payload, publishedAt)
               values(?, ?, ?, ?, ?, ?)
               on conflict(cmdId) do update set
                 deviceId = excluded.deviceId,
                 ts = excluded.ts,
                 type = excluded.type,
                 payload = excluded.payload,
                 publishedAt = excluded.publishedAt`
            ).run(cmdId, deviceId, Math.trunc(command.ts), command.type, payload, publishedAt);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("command_log write failed", e);
          }
        }
        resolve();
      });
    });

    return { cmdId };
  };

  const api = createApi(db, publishCommand);
  const server = http.createServer(api);
  const rt = createRealtime(server);

  mqttClient.on("connect", () => {
    mqttClient.subscribe([t.telemetryTopicPrefix, t.stateTopicPrefix], { qos: 0 });
    // eslint-disable-next-line no-console
    console.log("MQTT connected");
  });
  mqttClient.on("reconnect", () => {
    // eslint-disable-next-line no-console
    console.log("MQTT reconnecting...");
  });
  mqttClient.on("offline", () => {
    // eslint-disable-next-line no-console
    console.log("MQTT offline");
  });
  mqttClient.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("MQTT error", err.message);
  });

  mqttClient.on("message", (topic, payload) => {
    const now = Date.now();
    const parts = topic.split("/");
    const baseParts = env.MQTT_BASE_TOPIC.replace(/\/+$/, "").split("/");
    if (parts.length < baseParts.length + 2) return;

    const deviceId = parts[baseParts.length];
    const kind = parts[baseParts.length + 1];
    if (!deviceId || !kind) return;

    upsertDevice(db, deviceId, now);

    try {
      const json = JSON.parse(payload.toString("utf8"));

if (kind === "telemetry") {
        const parsed = TelemetrySchema.safeParse(json);
        if (!parsed.success) {
          // eslint-disable-next-line no-console
          console.error("Failed to parse telemetry", parsed.error);
          return;
        }

        const m = parsed.data;
        const compatibilityScore = calculateBestCompatibility(db, m.tempC, m.humidityPct, m.soilPct, m.lightPct);
        
        db.prepare(
          `insert into telemetry(deviceId, ts, seq, tempC, humidityPct, soilRaw, soilPct, waterLevelPct, lightPct, rssi, vbat, gpsLat, gpsLon, gpsHdop, compatibilityScore, receivedAt)
           values(@deviceId, @ts, @seq, @tempC, @humidityPct, @soilRaw, @soilPct, @waterLevelPct, @lightPct, @rssi, @vbat, @gpsLat, @gpsLon, @gpsHdop, @compatibilityScore, @receivedAt)`
        ).run({
          deviceId: m.deviceId,
          ts: Math.trunc(m.ts),
          seq: m.seq,
          tempC: m.tempC ?? null,
          humidityPct: m.humidityPct ?? null,
          soilRaw: m.soilRaw,
          soilPct: m.soilPct,
          waterLevelPct: m.waterLevelPct ?? null,
          lightPct: m.lightPct ?? null, // <-- BURAYA EKLEDİK (Zod şemasından gelen veri)
          rssi: m.rssi ?? null,
          vbat: m.vbat ?? null,
          gpsLat: m.gps?.lat ?? null,
          gpsLon: m.gps?.lon ?? null,
          gpsHdop: m.gps?.hdop ?? null,
          compatibilityScore,
          receivedAt: now
        });
        
        db.prepare(`update devices set lastTelemetryTs = ?, lastSeenTs = ? where deviceId = ?`).run(now, now, deviceId);
        setDeviceOnline(db, deviceId, true, now);
        rt.broadcast({ type: "telemetry", deviceId, data: { ...m, compatibilityScore } });
      } else if (kind === "state") {
        const parsed = DeviceStateSchema.safeParse(json);
        if (!parsed.success) return;

        const s = parsed.data;
        db.prepare(
          `insert into device_state(deviceId, ts, pumpOn, fanOn, mode, lastCmdId, receivedAt)
           values(@deviceId, @ts, @pumpOn, @fanOn, @mode, @lastCmdId, @receivedAt)
           on conflict(deviceId) do update set
             ts = excluded.ts,
             pumpOn = excluded.pumpOn,
             fanOn = excluded.fanOn,
             mode = excluded.mode,
             lastCmdId = excluded.lastCmdId,
             receivedAt = excluded.receivedAt`
        ).run({
          deviceId: s.deviceId,
          ts: Math.trunc(s.ts),
          pumpOn: s.pumpOn ? 1 : 0,
          fanOn: s.fanOn ? 1 : 0,
          mode: s.mode,
          lastCmdId: s.lastCmdId ?? null,
          receivedAt: now
        });
        db.prepare(`update devices set lastStateTs = ?, lastSeenTs = ? where deviceId = ?`).run(now, now, deviceId);
        setDeviceOnline(db, deviceId, true, now);
        rt.broadcast({ type: "state", deviceId, data: s });
      }
    } catch {
      return;
    }
  });

  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      // eslint-disable-next-line no-console
      console.error(`Port ${env.PORT} is already in use. Set a different PORT in backend/.env (e.g. 8081).`);
      process.exit(1);
    }
  });
  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Planty backend listening on ${env.PUBLIC_BASE_URL}`);
  });

  process.on("SIGINT", () => {
    mqttClient.end(true);
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
