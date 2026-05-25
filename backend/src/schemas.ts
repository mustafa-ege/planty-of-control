import { z } from "zod";

export const TelemetrySchema = z.object({
  deviceId: z.string().min(1),
  ts: z.number().finite(),
  seq: z.number().int().nonnegative(),
  tempC: z.number().finite().optional(),
  humidityPct: z.number().finite().min(0).max(100).optional(),
  soilRaw: z.number().int(),
  soilPct: z.number().finite().min(0).max(100),
  waterLevelPct: z.number().finite().min(0).max(100).optional(),
  lightPct: z.number().optional().nullable(),
  rssi: z.number().int().optional(),
  vbat: z.number().finite().optional(),
  gps: z
    .object({
      lat: z.number().finite(),
      lon: z.number().finite(),
      hdop: z.number().finite().nullable().optional()
    })
    .optional()
});

export type Telemetry = z.infer<typeof TelemetrySchema>;

export const DeviceStateSchema = z.object({
  deviceId: z.string().min(1),
  ts: z.number().finite(),
  pumpOn: z.boolean(),
  fanOn: z.boolean(),
  mode: z.enum(["auto", "manual"]),
  lastCmdId: z.string().min(1).nullable()
});

export type DeviceState = z.infer<typeof DeviceStateSchema>;

export const CommandSchema = z
  .discriminatedUnion("type", [
    z.object({
      cmdId: z.string().min(1),
      ts: z.number().finite(),
      type: z.literal("setMode"),
      mode: z.enum(["auto", "manual"])
    }),
    z.object({
      cmdId: z.string().min(1),
      ts: z.number().finite(),
      type: z.literal("pump"),
      on: z.boolean(),
      durationMs: z.number().int().positive().nullable().optional()
    }),
    z.object({
      cmdId: z.string().min(1),
      ts: z.number().finite(),
      type: z.literal("fan"),
      on: z.boolean(),
      durationMs: z.number().int().positive().nullable().optional()
    }),
    z.object({
      cmdId: z.string().min(1),
      ts: z.number().finite(),
      type: z.literal("stopAll")
    })
  ])
  .superRefine((v, ctx) => {
    if (
      v.type === "pump" &&
      v.on &&
      (v.durationMs == null || v.durationMs < 250 || v.durationMs > 30000)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pump on=true requires durationMs between 250 and 30000",
        path: ["durationMs"]
      });
    }
  });

export type Command = z.infer<typeof CommandSchema>;
