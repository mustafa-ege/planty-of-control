import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env.js";

export type Db = Database.Database;

function ensureDirForFile(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export function openDb(): Db {
  ensureDirForFile(env.SQLITE_PATH);
  const db = new Database(env.SQLITE_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initDb(db: Db) {
  db.exec(`
    create table if not exists devices (
      deviceId text primary key,
      lastSeenTs integer not null,
      lastTelemetryTs integer,
      lastStateTs integer,
      online integer not null default 0
    );

    create table if not exists telemetry (
      id integer primary key autoincrement,
      deviceId text not null,
      ts integer not null,
      seq integer not null,
      tempC real,
      humidityPct real,
      soilRaw integer not null,
      soilPct real not null,
      waterLevelPct real,
      lightPct real,
      rssi integer,
      vbat real,
      gpsLat real,
      gpsLon real,
      gpsHdop real,
      receivedAt integer not null,
      foreign key(deviceId) references devices(deviceId)
    );

    create index if not exists telemetry_device_ts on telemetry(deviceId, ts desc);

    create table if not exists device_state (
      deviceId text primary key,
      ts integer not null,
      pumpOn integer not null,
      fanOn integer not null,
      mode text not null,
      lastCmdId text,
      receivedAt integer not null,
      foreign key(deviceId) references devices(deviceId)
    );

    create table if not exists command_log (
      cmdId text primary key,
      deviceId text not null,
      ts integer not null,
      type text not null,
      payload text not null,
      publishedAt integer not null,
      foreign key(deviceId) references devices(deviceId)
    );
  `);
}

