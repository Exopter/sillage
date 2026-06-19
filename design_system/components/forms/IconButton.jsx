import React from 'react';

const CSS = `
.exds-iconbtn{
  display:inline-flex;align-items:center;justify-content:center;
  border-radius:var(--radius);border:1px solid transparent;cursor:pointer;
  color:var(--text-body);background:transparent;
  width:var(--control-h);height:var(--control-h);flex:none;
  transition:background var(--dur) var(--ease-out),color var(--dur) var(--ease-out),border-color var(--dur) var(--ease-out);
}
.exds-iconbtn:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.exds-iconbtn[disabled]{cursor:not-allowed;opacity:.45}
.exds-iconbtn svg{width:18px;height:18px}
.exds-iconbtn--sm{width:var(--control-h-sm);height:var(--control-h-sm)}
.exds-iconbtn--sm svg{width:16px;height:16px}
.exds-iconbtn--lg{width:var(--control-h-lg);height:var(--control-h-lg)}
.exds-iconbtn--ghost:hover:not([disabled]){background:var(--surface-hover)}
.exds-iconbtn--outline{border-color:var(--border-strong);background:var(--surface-card)}
.exds-iconbtn--outline:hover:not([disabled]){background:var(--surface-hover)}
.exds-iconbtn--solid{background:var(--accent);color:var(--accent-contrast);border-color:var(--accent)}
.exds-iconbtn--solid:hover:not([disabled]){background:var(--ex-carbon-800)}
/* round — only when shape IS the control (play, target, reset) */
.exds-iconbtn--round{border-radius:var(--radius-round)}
.exds-iconbtn--danger{color:var(--ex-red-600)}
.exds-iconbtn--danger:hover:not([disabled]){background:var(--ex-red-100)}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-iconbtn-css')) {
  const s = document.createElement('style'); s.id = 'exds-iconbtn-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter IconButton — compact single-icon control.
 * variant: ghost | outline | solid | danger ; size: sm | md | lg ; round for physical controls.
 */
export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  round = false,
  label,
  className = '',
  ...rest
}) {
  const cls = [
    'exds-iconbtn',
    `exds-iconbtn--${variant}`,
    size !== 'md' ? `exds-iconbtn--${size}` : '',
    round ? 'exds-iconbtn--round' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} aria-label={label} title={label} {...rest}>
      {icon}
    </button>
  );
}
