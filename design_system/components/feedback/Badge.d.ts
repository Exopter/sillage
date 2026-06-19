import * as React from 'react';

export type BadgeTone = 'neutral' | 'ready' | 'live' | 'caution' | 'fault' | 'info' | 'solid';

export interface BadgeProps {
  /** @default 'neutral' */
  tone?: BadgeTone;
  /** Optional 12px leading icon. */
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/** Compact uppercase status/mode token. Always labelled — never color-only. */
export function Badge(props: BadgeProps): React.JSX.Element;
