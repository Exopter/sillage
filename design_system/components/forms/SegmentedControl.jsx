import React from 'react';

const CSS = `
.exds-seg{display:inline-flex;align-items:center;gap:2px;padding:3px;
  background:var(--surface-panel);border:1px solid var(--border-rule);border-radius:var(--radius);}
.exds-seg__btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;
  font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:600;letter-spacing:var(--ls-label);text-transform:uppercase;
  color:var(--text-muted);background:transparent;border:none;cursor:pointer;
  height:26px;padding:0 12px;border-radius:var(--radius-compact);
  transition:background var(--dur) var(--ease-out),color var(--dur) var(--ease-out);}
.exds-seg__btn:hover:not([disabled]):not([data-active="true"]){color:var(--text-body)}
.exds-seg__btn[data-active="true"]{background:var(--accent);color:var(--accent-contrast)}
.exds-seg__btn[disabled]{opacity:.4;cursor:not-allowed}
.exds-seg__btn:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.exds-seg__btn svg{width:14px;height:14px}
.exds-seg--lg .exds-seg__btn{height:32px;font-size:var(--fs-sm)}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-seg-css')) {
  const s = document.createElement('style'); s.id = 'exds-seg-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter SegmentedControl — instrument-style mode switcher (e.g. GLD / EDF / JET).
 * Mode label is always visible; selection is never color-only.
 * options: [{ value, label, icon?, disabled? }]
 */
export function SegmentedControl({ options = [], value, defaultValue, onChange, size = 'md', ariaLabel = 'Mode', className = '' }) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue ?? (options[0] && options[0].value));
  const current = isControlled ? value : internal;
  const pick = (v) => { if (!isControlled) setInternal(v); onChange && onChange(v); };
  return (
    <div className={['exds-seg', size === 'lg' ? 'exds-seg--lg' : '', className].filter(Boolean).join(' ')}
         role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={current === o.value}
                className="exds-seg__btn" data-active={current === o.value ? 'true' : 'false'}
                disabled={o.disabled} onClick={() => pick(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
