import type { Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";

export type RealtimeEvent =
  | { type: "telemetry"; deviceId: string; data: unknown }
  | { type: "state"; deviceId: string; data: unknown }
  | { type: "availability"; deviceId: string; data: unknown };

export function createRealtime(httpServer: HttpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  function broadcast(evt: RealtimeEvent) {
    const msg = JSON.stringify(evt);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(msg);
    }
  }

  return { wss, broadcast };
}

