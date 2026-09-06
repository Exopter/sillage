import type { ChartType } from "chart.js"

declare module "chart.js" {
  interface ChartDatasetProperties<TType extends ChartType, TData> {
    metric?: string
  }
}
