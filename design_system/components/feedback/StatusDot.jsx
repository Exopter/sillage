import React from 'react';

const CSS = `
.exds-statusdot{display:inline-flex;align-items:center;gap:7px;font-family:var(--font-ui);font-size:var(--fs-sm);color:var(--text-body)}
.exds-statusdot__dot{width:9px;height:9px;border-radius:var(--radius-round);flex:none;position:relative}
.exds-statusdot__dot--hollow{background:transparent;border:2px solid var(--ex-amber-500);width:10px;height:10px}
.exds-statusdot--ready .exds-statusdot__dot{background:var(--ex-field-500)}
.exds-statusdot--live .exds-statusdot__dot{background:var(--ex-aqua-500)}
.exds-statusdot--caution .exds-statusdot__dot{background:var(--ex-amber-500)}
.exds-statusdot--fault .exds-statusdot__dot{background:var(--ex-red-600)}
.exds-statusdot--unknown .exds-statusdot__dot{background:var(--ex-graphite-500)}
.exds-statusdot__label{font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:600;letter-spacing:var(--ls-label);text-transform:uppercase}
/* pulsing ring for live */
.exds-statusdot--live.exds-statusdot--pulse .exds-statusdot__dot::after{
  content:"";position:absolute;inset:-4px;border-radius:var(--radius-round);
  border:1px solid var(--ex-aqua-500);animation:exds-pulse 1.6s var(--ease-out) infinite}
@keyframes exds-pulse{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.4);opacity:0}}
@media (prefers-reduced-motion: reduce){.exds-statusdot--pulse .exds-statusdot__dot::after{animation:none;opacity:0}}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-statusdot-css')) {
  const s = document.createElement('style'); s.id = 'exds-statusdot-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter StatusDot — inline state indicator with uppercase label.
 * state: ready | live | pending | caution | fault | unknown
 */
export function StatusDot({ state = 'unknown', label, pulse = false, className = '' }) {
  const hollow = state === 'pending';
  const text = label ?? state.toUpperCase();
  return (
    <span className={['exds-statusdot', `exds-statusdot--${state}`, pulse ? 'exds-statusdot--pulse' : '', className].filter(Boolean).join(' ')}>
      <span className={['exds-statusdot__dot', hollow ? 'exds-statusdot__dot--hollow' : ''].filter(Boolean).join(' ')} />
      <span className="exds-statusdot__label">{text}</span>
    </span>
  );
}
