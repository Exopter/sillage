import * as React from 'react';

export type ReadinessState = 'ready' | 'live' | 'pending' | 'caution' | 'fault' | 'unknown';

export interface ReadinessItem {
  /** Uppercase mono key, e.g. "PILOT", "BATTERY", "FDR". */
  label: string;
  /** Short value shown next to the status dot. */
  value: React.ReactNode;
  /** @default 'unknown' */
  state?: ReadinessState;
}

export interface ReadinessStripProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Leading mode token (e.g. "GLD"). */
  mode?: React.ReactNode;
  items: ReadinessItem[];
}

/**
 * Dense horizontal status band putting current state first: mode, pilot,
 * weather, battery, FDR, comms. Every item shows a value + dot, never color-only.
 */
export function ReadinessStrip(props: ReadinessStripProps): React.JSX.Element;
