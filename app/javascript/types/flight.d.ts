export interface FlightPoint {
  t: number; lat: number; lon: number; alt: number;
  height?: number | null; hspeed?: number | null; vspeed?: number | null; glide?: number | null;
  distance?: number | null; visualAlt?: number | null; groundAlt?: number | null; datumOffset?: number | null;
}
export type TelemetryPoint = Partial<Omit<FlightPoint,"alt">> & {alt?: number | null}
export interface SensorSample {
  t: number; type: string;
  readings: Record<string, unknown> & {pressure_altitude_m?: number | null; pressure_vertical_speed_mps?: number | null};
}
export interface FlightAnalysis {altitude_min?: number | null; timeline_start?: number | null; timeline_end?: number | null}
export interface FlightBounds {exit?: number | null; opening?: number | null; landing?: number | null}
export interface Orbit { targetPoint: FlightPoint; heading:number; pitch:number; range:number; minRange:number; maxRange:number }
export interface CesiumDiagnostics {
  startedAt:number; tileProvider:string;
  milestones: Array<{name:string;elapsedMs:number} & Record<string, unknown>>;
  loadProgress: Array<{elapsedMs:number;pendingRequests:number;tilesProcessing:number;tileLoads:number}>;
  tileLoads:number; tileFailures:Array<{elapsedMs:number;url?:string;message?:string}>;
  requestScheduler:{maximumRequests:number;maximumRequestsPerServer:number};
  tilesetOptions: Partial<import("cesium").Cesium3DTileset.ConstructorOptions>;
}
export type FlightChart = import("chart.js").Chart<"line", import("chart.js").ScatterDataPoint[]>
export type FlightDataset = import("chart.js").ChartDataset<"line", import("chart.js").ScatterDataPoint[]>
export type LinearAxis = import("chart.js").ChartOptions<"line">["scales"]
