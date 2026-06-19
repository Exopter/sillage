import React from 'react';

const CSS = `
.exds-strip{display:flex;align-items:stretch;font-family:var(--font-ui);
  background:var(--surface-card);border:1px solid var(--border-rule);border-radius:var(--radius);overflow:hidden}
.exds-strip__mode{display:flex;align-items:center;padding:0 14px;background:var(--accent);color:var(--accent-contrast);
  font-family:var(--font-mono);font-size:var(--fs-sm);font-weight:600;letter-spacing:var(--ls-label);text-transform:uppercase}
.exds-strip__item{display:flex;flex-direction:column;justify-content:center;gap:3px;padding:8px 16px;flex:1;min-width:0;
  border-left:1px solid var(--border-rule)}
.exds-strip__item:first-child{border-left:none}
.exds-strip__k{font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:500;letter-spacing:var(--ls-label);text-transform:uppercase;color:var(--text-muted)}
.exds-strip__v{display:flex;align-items:center;gap:7px;font-size:var(--fs-sm);color:var(--text-body)}
.exds-strip__dot{width:8px;height:8px;border-radius:var(--radius-round);flex:none}
.exds-strip__dot--hollow{background:transparent!important;border:2px solid var(--ex-amber-500);width:9px;height:9px}
.exds-strip__vlabel{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-weight:500}
.is-ready .exds-strip__dot{background:var(--ex-field-500)}
.is-live .exds-strip__dot{background:var(--ex-aqua-500)}
.is-caution .exds-strip__dot{background:var(--ex-amber-500)}
.is-fault .exds-strip__dot{background:var(--ex-red-600)}
.is-unknown .exds-strip__dot{background:var(--ex-graphite-500)}
.is-fault .exds-strip__vlabel{color:var(--ex-red-600)}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-strip-css')) {
  const s = document.createElement('style'); s.id = 'exds-strip-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter ReadinessStrip — dense horizontal status band (mode, pilot, weather,
 * battery, FDR, comms…). Each item carries an explicit value, never color-only.
 * mode: optional leading mode token. items: [{ label, value, state }]
 */
export function ReadinessStrip({ mode, items = [], className = '', ...rest }) {
  return (
    <div className={['exds-strip', className].filter(Boolean).join(' ')} {...rest}>
      {mode && <div className="exds-strip__mode">{mode}</div>}
      {items.map((it, i) => (
        <div key={i} className={`exds-strip__item is-${it.state || 'unknown'}`}>
          <span className="exds-strip__k">{it.label}</span>
          <span className="exds-strip__v">
            <span className={['exds-strip__dot', it.state === 'pending' ? 'exds-strip__dot--hollow' : ''].filter(Boolean).join(' ')} />
            <span className="exds-strip__vlabel">{it.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
