import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import { env } from "./env.js";

export type MqttTopics = {
  telemetryTopicPrefix: string; // `${base}/{deviceId}/telemetry` is the final
  stateTopicPrefix: string;
  cmdTopic: (deviceId: string) => string;
  telemetryTopic: (deviceId: string) => string;
  stateTopic: (deviceId: string) => string;
  availabilityTopic: (deviceId: string) => string;
};

export function topicsFromEnv(): MqttTopics {
  const base = env.MQTT_BASE_TOPIC.replace(/\/+$/, "");
  return {
    telemetryTopicPrefix: `${base}/+/telemetry`,
    stateTopicPrefix: `${base}/+/state`,
    cmdTopic: (deviceId) => `${base}/${deviceId}/cmd`,
    telemetryTopic: (deviceId) => `${base}/${deviceId}/telemetry`,
    stateTopic: (deviceId) => `${base}/${deviceId}/state`,
    availabilityTopic: (deviceId) => `${base}/${deviceId}/availability`
  };
}

export function connectMqtt(): MqttClient {
  const opts: IClientOptions = {
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 2000,
    connectTimeout: 10_000,
    keepalive: 30
  };

  // Important: do NOT crash the server if the broker is down.
  // mqtt.js will keep retrying based on reconnectPeriod.
  return mqtt.connect(env.MQTT_URL, opts);
}

