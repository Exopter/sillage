import React from 'react';

const CSS = `
.exds-metric{display:flex;flex-direction:column;gap:4px;font-family:var(--font-ui);
  padding:12px 14px;background:var(--surface-card);border:1px solid var(--border-rule);border-radius:var(--radius);min-width:120px}
.exds-metric--sunken{background:var(--surface-sunken);box-shadow:var(--shadow-inset);border-color:transparent}
.exds-metric__label{display:flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:500;letter-spacing:var(--ls-label);text-transform:uppercase;color:var(--text-muted)}
.exds-metric__label svg{width:13px;height:13px}
.exds-metric__value{font-family:var(--font-data);font-variant-numeric:tabular-nums lining-nums;
  font-size:var(--fs-metric);font-weight:500;line-height:1;color:var(--text-strong);display:flex;align-items:baseline;gap:4px}
.exds-metric__unit{font-family:var(--font-mono);font-size:var(--fs-sm);font-weight:500;color:var(--text-muted)}
.exds-metric__delta{display:inline-flex;align-items:center;gap:3px;font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:600}
.exds-metric__delta--up{color:var(--ex-field-500)}
.exds-metric__delta--down{color:var(--ex-red-600)}
.exds-metric__delta--flat{color:var(--text-muted)}
.exds-metric--ready .exds-metric__value{color:var(--ex-field-500)}
.exds-metric--caution .exds-metric__value{color:var(--ex-amber-500)}
.exds-metric--fault .exds-metric__value{color:var(--ex-red-600)}
.exds-metric--live .exds-metric__value{color:var(--ex-aqua-500)}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-metric-css')) {
  const s = document.createElement('style'); s.id = 'exds-metric-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter MetricTile — instrument readout with tabular numerals, unit, and optional delta.
 * state: default | ready | caution | fault | live ; trend: up | down | flat
 */
export function MetricTile({
  label, icon = null, value, unit, delta, trend = 'flat',
  state = 'default', sunken = false, className = '',
}) {
  const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '–';
  return (
    <div className={['exds-metric', state !== 'default' ? `exds-metric--${state}` : '', sunken ? 'exds-metric--sunken' : '', className].filter(Boolean).join(' ')}>
      <span className="exds-metric__label">{icon}{label}</span>
      <span className="exds-metric__value">{value}{unit && <span className="exds-metric__unit">{unit}</span>}</span>
      {delta != null && (
        <span className={`exds-metric__delta exds-metric__delta--${trend}`}>{arrow} {delta}</span>
      )}
    </div>
  );
}
