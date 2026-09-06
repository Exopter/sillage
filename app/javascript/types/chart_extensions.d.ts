import type { ChartType } from "chart.js"

declare module "chart.js" {
  interface ChartDatasetProperties<TType extends ChartType, TData> {
    metric?: string
    unit?: string
  }
  interface TooltipPositionerMap {
    osAwayFromPoint: import("chart.js").TooltipPositionerFunction<import("chart.js").ChartType>
  }
  interface PluginOptionsByType<TType extends import("chart.js").ChartType> {
    osBounds?: false | {bounds: import("./flight").FlightBounds; labels: Record<string,string>}
    osPlayback?: false | {elapsed:number;color:string;pointColor:string}
  }
}
