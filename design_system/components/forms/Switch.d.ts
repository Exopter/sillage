import * as React from 'react';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** Controlled on/off. */
  checked?: boolean;
  /** Uncontrolled initial state. */
  defaultChecked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  /** Text label rendered after the track. */
  label?: string;
}

/** Physical-style on/off toggle. Field green when on; never the only state cue. */
export function Switch(props: SwitchProps): React.JSX.Element;
