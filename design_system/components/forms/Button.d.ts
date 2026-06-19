import * as React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual role. `danger` for destructive/abort actions only. @default 'primary' */
  variant?: ButtonVariant;
  /** @default 'md' */
  size?: ButtonSize;
  /** Stretch to full container width. */
  block?: boolean;
  /** Icon node rendered before the label (e.g. a 18px Lucide SVG). */
  iconLeft?: React.ReactNode;
  /** Icon node rendered after the label. */
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Primary operational button. Carbon-filled by default; outline, ghost, and
 * danger variants for secondary and destructive actions.
 */
export function Button(props: ButtonProps): React.JSX.Element;
