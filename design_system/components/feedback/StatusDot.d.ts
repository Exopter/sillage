import * as React from 'react';

export type StatusState = 'ready' | 'live' | 'pending' | 'caution' | 'fault' | 'unknown';

export interface StatusDotProps {
  /** @default 'unknown' */
  state?: StatusState;
  /** Override the auto-uppercased label text. */
  label?: string;
  /** Animated ring — use for live/active telemetry only. */
  pulse?: boolean;
  className?: string;
}

/** Inline state indicator: colored dot (hollow ring when pending) + uppercase label. */
export function StatusDot(props: StatusDotProps): React.JSX.Element;
