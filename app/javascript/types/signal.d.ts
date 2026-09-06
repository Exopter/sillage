export type DecodedMessage =
  | { name: "heartbeat"; customMode: number; type: number; autopilot: number; baseMode: number; systemStatus: number }
  | { name: "system_status"; sensorsPresent: number; sensorsEnabled: number; sensorsHealthy: number; loadPermille: number; voltageMv: number; batteryRemaining: number }
  | { name: "ping"; timeUs: string; sequence: number; targetSystem: number; targetComponent: number }
  | { name: "gps"; timeUs: string; latitude: number; longitude: number; altitudeM: number; ephM: number; epvM: number; velocityMps: number; courseDeg: number; fix: number; satellites: number }
  | { name: "attitude"; quaternion: number[]; rollDeg: number; pitchDeg: number; yawDeg: number; rollSpeed: number; pitchSpeed: number; yawSpeed: number }
  | { name: "vfr_hud"; airspeedMps: number; groundspeedMps: number; altitudeM: number; climbMps: number; headingDeg: number; throttlePercent: number }
  | { name: "radio"; rxErrors: number; fixed: number; rssi: number; remoteRssi: number; txBufferPercent: number; noise: number; remoteNoise: number; rssiDbm: number; remoteRssiDbm: number }
  | { name: "pressure"; timeBootMs: number; absoluteHpa: number; differentialHpa: number; temperatureC: number }
  | { name: "status_text"; severity: number; text: string }
  | { name: "unknown" }

export interface FrameMessage {
  type: "frame"; messageId: number; systemId: number; componentId: number; sequence: number;
  receivedAtUs: string; decoded: DecodedMessage;
  parser: { errors: number; ignored: number; dropped: number }; raw: ArrayBuffer;
}
export type CaptureMessage = FrameMessage
  | { type: "capture-ready"; filename: string; bytes: number }
  | { type: "capture-closed"; bytes: number }
  | { type: "capture-error"; message: string }
export type CaptureCommand = { type: "init-capture"; filename: string }
  | { type: "bytes"; bytes: ArrayBuffer; receivedAtUs: string }
  | { type: "close" }

export type SignalSample = { kind: "sensor"; sensor_type: string; recorded_at: string; readings: Record<string, unknown> }
  | { kind: "gps"; recorded_at: string; latitude: number; longitude: number; altitude_m?: number;
      horizontal_accuracy_m?: number; vertical_accuracy_m?: number; horizontal_speed_mps?: number;
      heading_deg?: number; gps_fix?: number; satellite_count?: number }
export interface BatchBody {
  sequence: number; first_received_at: string; last_received_at: string;
  mavlink_system_id?: string | null; mavlink_component_id?: string | null;
  position?: { longitude: number; latitude: number } | null; samples: SignalSample[];
}
export interface EventBody {
  event_uuid: string; event_type: string; occurred_at: string; label: string; metadata: Record<string, unknown>;
}
export type OutboxRecord = { id: string; session: string; queuedAt: number; url: string } & (
  { kind: "batch"; method: "POST"; sequence: number; body: BatchBody }
  | { kind: "event"; method: "POST"; body: EventBody }
  | { kind: "complete"; method: "PATCH"; body: { ended_at: string } }
)
