import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const RawEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_BASE_URL: z.string().optional(),

  MQTT_URL: z.string().default("mqtt://127.0.0.1:1883"),
  MQTT_USERNAME: z.string().optional().default(""),
  MQTT_PASSWORD: z.string().optional().default(""),

  SQLITE_PATH: z.string().default("./data/planty.sqlite"),

  MQTT_BASE_TOPIC: z.string().default("planty/v1")
});

const raw = RawEnvSchema.parse(process.env);
export const env = {
  ...raw,
  PUBLIC_BASE_URL: raw.PUBLIC_BASE_URL ?? `http://localhost:${raw.PORT}`
};

