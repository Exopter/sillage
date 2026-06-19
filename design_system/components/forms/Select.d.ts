import * as React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Uppercase mono field label. */
  label?: string;
  /** Options array (alternative to passing <option> children). */
  options?: SelectOption[];
}

/** Native select with instrument-style chrome and chevron affordance. */
export function Select(props: SelectProps): React.JSX.Element;
