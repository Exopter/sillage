import * as React from 'react';

export type ToastTone = 'info' | 'ready' | 'caution' | 'fault';

export interface ToastProps {
  /** @default 'info' */
  tone?: ToastTone;
  /** Optional 20px leading icon. */
  icon?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  /** Show a dismiss button when provided. */
  onClose?: () => void;
  className?: string;
}

/** Transient operational notification with a left accent rule keyed to tone. */
export function Toast(props: ToastProps): React.JSX.Element;
