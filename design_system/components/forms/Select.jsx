import React from 'react';

const CSS = `
.exds-select-field{display:flex;flex-direction:column;gap:6px;font-family:var(--font-ui)}
.exds-select-field__label{font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:500;letter-spacing:var(--ls-label);text-transform:uppercase;color:var(--text-muted)}
.exds-select-wrap{position:relative;display:flex;align-items:center;background:var(--surface-card);
  border:1px solid var(--border-rule);border-radius:var(--radius);height:var(--control-h);
  transition:border-color var(--dur) var(--ease-out),box-shadow var(--dur) var(--ease-out);}
.exds-select-wrap:focus-within{border-color:var(--focus-ring);box-shadow:0 0 0 1px var(--focus-ring)}
.exds-select{appearance:none;-webkit-appearance:none;border:none;outline:none;background:transparent;
  font-family:var(--font-ui);font-size:var(--fs-body);color:var(--text-body);
  height:100%;width:100%;padding:0 34px 0 12px;cursor:pointer}
.exds-select[disabled]{cursor:not-allowed;opacity:.55}
.exds-select-wrap__chev{position:absolute;right:10px;pointer-events:none;color:var(--text-muted);display:flex}
.exds-select-wrap__chev svg{width:16px;height:16px}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-select-css')) {
  const s = document.createElement('style'); s.id = 'exds-select-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
);

/**
 * Exopter Select — native select with instrument-style chrome.
 * options: [{ value, label, disabled? }] (or pass children <option>s).
 */
export function Select({ label, options, id, className = '', children, ...rest }) {
  const sid = id || (label ? `exds-sel-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return (
    <div className={['exds-select-field', className].filter(Boolean).join(' ')}>
      {label && <label className="exds-select-field__label" htmlFor={sid}>{label}</label>}
      <div className="exds-select-wrap">
        <select id={sid} className="exds-select" {...rest}>
          {options ? options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          )) : children}
        </select>
        <span className="exds-select-wrap__chev"><Chevron /></span>
      </div>
    </div>
  );
}
