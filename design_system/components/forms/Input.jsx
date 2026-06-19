import React from 'react';

const CSS = `
.exds-field{display:flex;flex-direction:column;gap:6px;font-family:var(--font-ui)}
.exds-field__label{font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:500;letter-spacing:var(--ls-label);text-transform:uppercase;color:var(--text-muted)}
.exds-field__req{color:var(--ex-red-600);margin-left:4px}
.exds-input-wrap{display:flex;align-items:center;gap:8px;background:var(--surface-card);
  border:1px solid var(--border-rule);border-radius:var(--radius);height:var(--control-h);padding:0 12px;
  transition:border-color var(--dur) var(--ease-out),box-shadow var(--dur) var(--ease-out);}
.exds-input-wrap:focus-within{border-color:var(--focus-ring);box-shadow:0 0 0 1px var(--focus-ring)}
.exds-input-wrap--error{border-color:var(--ex-red-600)}
.exds-input-wrap--error:focus-within{border-color:var(--ex-red-600);box-shadow:0 0 0 1px var(--ex-red-600)}
.exds-input-wrap[data-disabled="true"]{background:var(--surface-panel);opacity:.6}
.exds-input{flex:1;min-width:0;border:none;outline:none;background:transparent;
  font-family:var(--font-ui);font-size:var(--fs-body);color:var(--text-body);height:100%}
.exds-input::placeholder{color:var(--text-muted)}
.exds-input--data{font-family:var(--font-data);font-variant-numeric:tabular-nums;text-align:right}
.exds-input__affix{font-family:var(--font-mono);font-size:var(--fs-sm);color:var(--text-muted);white-space:nowrap}
.exds-input__affix svg{width:16px;height:16px;display:block;color:var(--text-muted)}
.exds-field__hint{font-size:var(--fs-xs);color:var(--text-muted)}
.exds-field__hint--error{color:var(--ex-red-600);font-family:var(--font-mono)}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-input-css')) {
  const s = document.createElement('style'); s.id = 'exds-input-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter Input — labelled text/number field with optional prefix, unit suffix,
 * hint, and error state. Use `data` for right-aligned tabular numeric entry.
 */
export function Input({
  label,
  required = false,
  prefix = null,
  suffix = null,
  hint = '',
  error = '',
  data = false,
  id,
  className = '',
  ...rest
}) {
  const fieldId = id || (label ? `exds-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return (
    <div className={['exds-field', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="exds-field__label" htmlFor={fieldId}>
          {label}{required && <span className="exds-field__req">*</span>}
        </label>
      )}
      <div className={['exds-input-wrap', error ? 'exds-input-wrap--error' : ''].filter(Boolean).join(' ')}
           data-disabled={rest.disabled ? 'true' : 'false'}>
        {prefix && <span className="exds-input__affix">{prefix}</span>}
        <input id={fieldId} className={['exds-input', data ? 'exds-input--data' : ''].filter(Boolean).join(' ')}
               aria-invalid={error ? 'true' : undefined} {...rest} />
        {suffix && <span className="exds-input__affix">{suffix}</span>}
      </div>
      {error
        ? <span className="exds-field__hint exds-field__hint--error">{error}</span>
        : hint && <span className="exds-field__hint">{hint}</span>}
    </div>
  );
}
