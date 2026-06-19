import React from 'react';

const CSS = `
.exds-toast{display:flex;align-items:flex-start;gap:12px;font-family:var(--font-ui);
  background:var(--surface-card);border:1px solid var(--border-rule);border-left-width:3px;
  border-radius:var(--radius);box-shadow:var(--shadow-md);padding:12px 14px;min-width:300px;max-width:420px}
.exds-toast__icon{flex:none;width:20px;height:20px;margin-top:1px}
.exds-toast__icon svg{width:20px;height:20px}
.exds-toast__body{flex:1;min-width:0}
.exds-toast__title{font-size:var(--fs-body);font-weight:600;color:var(--text-strong)}
.exds-toast__msg{font-size:var(--fs-sm);color:var(--text-muted);margin-top:2px}
.exds-toast__close{flex:none;border:none;background:transparent;cursor:pointer;color:var(--text-muted);
  width:24px;height:24px;border-radius:var(--radius-compact);display:flex;align-items:center;justify-content:center}
.exds-toast__close:hover{background:var(--surface-hover);color:var(--text-body)}
.exds-toast__close svg{width:14px;height:14px}
.exds-toast--info{border-left-color:var(--ex-sky-500)} .exds-toast--info .exds-toast__icon{color:var(--ex-sky-500)}
.exds-toast--ready{border-left-color:var(--ex-field-500)} .exds-toast--ready .exds-toast__icon{color:var(--ex-field-500)}
.exds-toast--caution{border-left-color:var(--ex-amber-500)} .exds-toast--caution .exds-toast__icon{color:var(--ex-amber-500)}
.exds-toast--fault{border-left-color:var(--ex-red-600)} .exds-toast--fault .exds-toast__icon{color:var(--ex-red-600)}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-toast-css')) {
  const s = document.createElement('style'); s.id = 'exds-toast-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

const X = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>);

/**
 * Exopter Toast — transient operational notification.
 * tone: info | ready | caution | fault
 */
export function Toast({ tone = 'info', icon = null, title, children, onClose, className = '' }) {
  return (
    <div role="status" className={['exds-toast', `exds-toast--${tone}`, className].filter(Boolean).join(' ')}>
      {icon && <span className="exds-toast__icon">{icon}</span>}
      <div className="exds-toast__body">
        {title && <div className="exds-toast__title">{title}</div>}
        {children && <div className="exds-toast__msg">{children}</div>}
      </div>
      {onClose && <button type="button" className="exds-toast__close" aria-label="Dismiss" onClick={onClose}><X/></button>}
    </div>
  );
}
