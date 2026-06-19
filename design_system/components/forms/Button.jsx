import React from 'react';

/* Inject component CSS once (real hover/focus/active states, token-driven). */
const CSS = `
.exds-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  font-family:var(--font-ui);font-weight:600;font-size:var(--fs-body);
  line-height:1;white-space:nowrap;cursor:pointer;
  border-radius:var(--radius);border:1px solid transparent;
  height:var(--control-h);padding:0 16px;
  transition:background var(--dur) var(--ease-out),border-color var(--dur) var(--ease-out),color var(--dur) var(--ease-out);
  -webkit-font-smoothing:antialiased;
}
.exds-btn:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.exds-btn[disabled]{cursor:not-allowed;opacity:.45}
.exds-btn--sm{height:var(--control-h-sm);padding:0 12px;font-size:var(--fs-sm)}
.exds-btn--lg{height:var(--control-h-lg);padding:0 20px}
.exds-btn--block{width:100%}
.exds-btn svg{width:18px;height:18px;flex:none}

/* primary — carbon gradient, white text (matches app .primary-button) */
.exds-btn--primary{background:linear-gradient(135deg,var(--ex-carbon-800),var(--ex-carbon-950));color:#fff;border-color:transparent;box-shadow:0 10px 22px rgba(16,24,26,.2)}
.exds-btn--primary:hover:not([disabled]){filter:brightness(.96)}
.exds-btn--primary:active:not([disabled]){filter:brightness(.9)}

/* secondary — outline on surface */
.exds-btn--secondary{background:var(--surface-card);color:var(--text-body);border-color:var(--border-strong)}
.exds-btn--secondary:hover:not([disabled]){background:var(--surface-hover)}
.exds-btn--secondary:active:not([disabled]){background:var(--surface-panel)}

/* ghost — no chrome until hover */
.exds-btn--ghost{background:transparent;color:var(--text-body)}
.exds-btn--ghost:hover:not([disabled]){background:var(--surface-hover)}

/* danger — destructive / abort */
.exds-btn--danger{background:var(--ex-red-600);color:#fff;border-color:var(--ex-red-600)}
.exds-btn--danger:hover:not([disabled]){background:#cf322d}
.exds-btn--danger:active:not([disabled]){background:#b82b27}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-btn-css')) {
  const s = document.createElement('style'); s.id = 'exds-btn-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter Button — primary operational control.
 * variant: primary | secondary | ghost | danger
 * size: sm | md | lg
 */
export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  iconLeft = null,
  iconRight = null,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'exds-btn',
    `exds-btn--${variant}`,
    size !== 'md' ? `exds-btn--${size}` : '',
    block ? 'exds-btn--block' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {iconLeft}
      {children != null && <span>{children}</span>}
      {iconRight}
    </button>
  );
}
