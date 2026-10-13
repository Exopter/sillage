interface Window {
  Cesium?: typeof import("cesium")
  CESIUM_BASE_URL?: string
  Stimulus: import("@hotwired/stimulus").Application
  Turbo?: {visit(url: string): void}
  sillageCesiumDiagnostics?: unknown
}
declare module "https://cdn.jsdelivr.net/npm/chart.js@4.4.9/+esm" {
  export { Chart, Tooltip, registerables } from "chart.js"
}

declare module "@hotwired/stimulus-loading" {
  export function eagerLoadControllersFrom(path: string, application: import("@hotwired/stimulus").Application): void
  export function lazyLoadControllersFrom(path: string, application: import("@hotwired/stimulus").Application): void
}
declare module "@hotwired/turbo-rails" {
  export const Turbo: { visit(url: string): void; cache: { clear(): void } }
}
