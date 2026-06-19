import * as React from 'react';

export type MetricState = 'default' | 'ready' | 'caution' | 'fault' | 'live';
export type MetricTrend = 'up' | 'down' | 'flat';

export interface MetricTileProps {
  /** Uppercase mono metric label. */
  label: string;
  /** Optional 13px leading icon. */
  icon?: React.ReactNode;
  /** The numeric reading (string or number). Rendered tabular. */
  value: React.ReactNode;
  /** Short unit, e.g. "km/h", "m", "°C", "kW". */
  unit?: string;
  /** Optional delta value rendered below with a trend arrow. */
  delta?: React.ReactNode;
  /** @default 'flat' */
  trend?: MetricTrend;
  /** Tints the value for safety/telemetry semantics. @default 'default' */
  state?: MetricState;
  /** Inset instrument-slot styling. */
  sunken?: boolean;
  className?: string;
}

/** Instrument readout tile — tabular numerals, short unit, optional trend delta. */
export function MetricTile(props: MetricTileProps): React.JSX.Element;
