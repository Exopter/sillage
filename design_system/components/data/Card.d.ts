import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Uppercase mono kicker above the title. */
  eyebrow?: string;
  title?: string;
  /** Right-aligned header controls (buttons, badges). */
  actions?: React.ReactNode;
  /** 'light' (vapor/white) or 'carbon' (dark instrument panel). @default 'light' */
  surface?: 'light' | 'carbon';
  /** @default 'sm' */
  elevation?: 'flat' | 'sm' | 'raised';
  /** Remove body padding (for tables/media that bleed to the edge). */
  flush?: boolean;
  children?: React.ReactNode;
}

/**
 * Framed container for repeated items and tools. Never nest cards inside cards.
 */
export function Card(props: CardProps): React.JSX.Element;
