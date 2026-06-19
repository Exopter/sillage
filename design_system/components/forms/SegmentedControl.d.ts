import * as React from 'react';

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  /** Controlled selected value. */
  value?: string;
  /** Uncontrolled initial value (defaults to first option). */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** @default 'md' */
  size?: 'md' | 'lg';
  ariaLabel?: string;
  className?: string;
}

/**
 * Instrument-style mode switcher (GLD / EDF / JET, or Flight / Forge / Core).
 * Mode label always visible; selection never color-only.
 */
export function SegmentedControl(props: SegmentedControlProps): React.JSX.Element;
