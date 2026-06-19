import React from 'react';

const CSS = `
.exds-switch{display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-family:var(--font-ui);user-select:none}
.exds-switch[data-disabled="true"]{cursor:not-allowed;opacity:.45}
.exds-switch__track{position:relative;width:40px;height:22px;border-radius:var(--radius-round);
  background:var(--ex-graphite-400);border:1px solid transparent;flex:none;
  transition:background var(--dur) var(--ease-out);}
.exds-switch__track[data-on="true"]{background:var(--ex-field-500)}
.exds-switch__thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:var(--radius-round);
  background:#fff;box-shadow:var(--shadow-sm);transition:transform var(--dur) var(--ease-out);}
.exds-switch__track[data-on="true"] .exds-switch__thumb{transform:translateX(18px)}
.exds-switch input{position:absolute;opacity:0;width:0;height:0}
.exds-switch input:focus-visible + .exds-switch__track{outline:2px solid var(--focus-ring);outline-offset:2px}
.exds-switch__label{font-size:var(--fs-body);color:var(--text-body)}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-switch-css')) {
  const s = document.createElement('style'); s.id = 'exds-switch-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter Switch — physical-style on/off toggle. Field green when on.
 * Controlled via `checked` + `onChange`, or uncontrolled via `defaultChecked`.
 */
export function Switch({ checked, defaultChecked, onChange, disabled = false, label, id, className = '', ...rest }) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState(!!defaultChecked);
  const on = isControlled ? checked : internal;
  const handle = (e) => { if (!isControlled) setInternal(e.target.checked); onChange && onChange(e); };
  const sid = id || (label ? `exds-sw-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return (
    <label className={['exds-switch', className].filter(Boolean).join(' ')} data-disabled={disabled ? 'true' : 'false'} htmlFor={sid}>
      <input id={sid} type="checkbox" role="switch" checked={on} disabled={disabled} onChange={handle} {...rest} />
      <span className="exds-switch__track" data-on={on ? 'true' : 'false'}><span className="exds-switch__thumb" /></span>
      {label && <span className="exds-switch__label">{label}</span>}
    </label>
  );
}
