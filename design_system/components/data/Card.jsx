import React from 'react';

const CSS = `
.exds-card{background:var(--surface-card);border:1px solid var(--border-rule);border-radius:var(--radius);
  box-shadow:var(--shadow-sm);color:var(--text-body);display:flex;flex-direction:column}
.exds-card--flat{box-shadow:none}
.exds-card--raised{box-shadow:var(--shadow-md)}
.exds-card__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
  padding:14px 16px;border-bottom:1px solid var(--border-rule)}
.exds-card__titles{display:flex;flex-direction:column;gap:2px;min-width:0}
.exds-card__eyebrow{font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:500;letter-spacing:var(--ls-wide);text-transform:uppercase;color:var(--text-muted)}
.exds-card__title{font-size:var(--fs-h4);font-weight:600;color:var(--text-strong);line-height:1.2}
.exds-card__actions{display:flex;align-items:center;gap:8px;flex:none}
.exds-card__body{padding:16px}
.exds-card__body--flush{padding:0}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-card-css')) {
  const s = document.createElement('style'); s.id = 'exds-card-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter Card — framed container for repeated items and tools.
 * Never nest a Card inside a Card. Use `surface="carbon"` for instrument panels.
 * elevation: flat | sm | raised
 */
export function Card({
  eyebrow, title, actions, surface = 'light', elevation = 'sm', flush = false,
  children, className = '', ...rest
}) {
  const cls = [
    'exds-card',
    elevation === 'flat' ? 'exds-card--flat' : '',
    elevation === 'raised' ? 'exds-card--raised' : '',
    surface === 'carbon' ? 'ex-dark' : '',
    className,
  ].filter(Boolean).join(' ');
  const hasHead = eyebrow || title || actions;
  return (
    <section className={cls} {...rest}>
      {hasHead && (
        <header className="exds-card__head">
          <div className="exds-card__titles">
            {eyebrow && <span className="exds-card__eyebrow">{eyebrow}</span>}
            {title && <h3 className="exds-card__title">{title}</h3>}
          </div>
          {actions && <div className="exds-card__actions">{actions}</div>}
        </header>
      )}
      <div className={['exds-card__body', flush ? 'exds-card__body--flush' : ''].filter(Boolean).join(' ')}>
        {children}
      </div>
    </section>
  );
}
