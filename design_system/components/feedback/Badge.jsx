import React from 'react';

const CSS = `
.exds-badge{display:inline-flex;align-items:center;gap:5px;
  font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:600;letter-spacing:var(--ls-label);text-transform:uppercase;
  height:20px;padding:0 8px;border-radius:var(--radius-compact);border:1px solid transparent;white-space:nowrap}
.exds-badge svg{width:12px;height:12px}
.exds-badge--neutral{background:var(--surface-panel);color:var(--text-muted);border-color:var(--border-rule)}
.exds-badge--ready{background:var(--ex-field-100);color:var(--ex-field-500);border-color:var(--ex-field-500)}
.exds-badge--live{background:var(--ex-aqua-100);color:#138577;border-color:var(--ex-aqua-500)}
.exds-badge--caution{background:var(--ex-amber-100);color:#9a5d12;border-color:var(--ex-amber-500)}
.exds-badge--fault{background:var(--ex-red-100);color:var(--ex-red-600);border-color:var(--ex-red-600)}
.exds-badge--info{background:var(--ex-sky-100);color:#1668a8;border-color:var(--ex-sky-500)}
.exds-badge--solid{background:var(--accent);color:var(--accent-contrast);border-color:var(--accent)}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-badge-css')) {
  const s = document.createElement('style'); s.id = 'exds-badge-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter Badge — compact status / mode token. Always shows a label (never color-only).
 * tone: neutral | ready | live | caution | fault | info | solid
 */
export function Badge({ tone = 'neutral', icon = null, children, className = '' }) {
  return (
    <span className={['exds-badge', `exds-badge--${tone}`, className].filter(Boolean).join(' ')}>
      {icon}{children}
    </span>
  );
}
