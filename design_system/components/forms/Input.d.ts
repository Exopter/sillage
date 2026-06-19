import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Uppercase mono field label. */
  label?: string;
  /** Show required asterisk. */
  required?: boolean;
  /** Node before the value (icon or short text). */
  prefix?: React.ReactNode;
  /** Unit/affix after the value, e.g. "km/h", "°C", "kg". */
  suffix?: React.ReactNode;
  /** Helper text below the field. */
  hint?: string;
  /** Error message — sets the error state and overrides hint. */
  error?: string;
  /** Right-align with tabular mono figures (numeric entry). */
  data?: boolean;
}

/** Labelled text/number field with prefix, unit suffix, hint, and error state. */
export function Input(props: InputProps): React.JSX.Element;
