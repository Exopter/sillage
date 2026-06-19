import * as React from 'react';

export type IconButtonVariant = 'ghost' | 'outline' | 'solid' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Icon node (e.g. an 18px Lucide SVG). Required. */
  icon: React.ReactNode;
  /** @default 'ghost' */
  variant?: IconButtonVariant;
  /** @default 'md' */
  size?: IconButtonSize;
  /** Fully round — use only when the shape IS the control (play, reset, target). */
  round?: boolean;
  /** Accessible label (also the tooltip). */
  label?: string;
}

/** Compact single-icon control for toolbars and instrument panels. */
export function IconButton(props: IconButtonProps): React.JSX.Element;
