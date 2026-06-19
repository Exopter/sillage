import React from 'react';

const CSS = `
.exds-check{display:flex;align-items:center;gap:12px;font-family:var(--font-ui);
  padding:11px 14px;background:var(--surface-card);border:1px solid var(--border-rule);border-radius:var(--radius)}
.exds-check + .exds-check{margin-top:-1px}
.exds-check__box{width:22px;height:22px;border-radius:var(--radius-compact);flex:none;
  display:flex;align-items:center;justify-content:center;border:2px solid var(--ex-graphite-400);color:transparent}
.exds-check__box svg{width:14px;height:14px}
.exds-check--done .exds-check__box{background:var(--ex-field-500);border-color:var(--ex-field-500);color:#fff}
.exds-check--active .exds-check__box{border-color:var(--ex-aqua-500);color:var(--ex-aqua-500)}
.exds-check--active .exds-check__box::after{content:"";width:8px;height:8px;border-radius:var(--radius-round);background:var(--ex-aqua-500)}
.exds-check--blocked .exds-check__box{border-color:var(--ex-red-600);color:var(--ex-red-600)}
.exds-check__body{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.exds-check__title{font-size:var(--fs-body);color:var(--text-strong)}
.exds-check--done .exds-check__title{color:var(--text-muted)}
.exds-check__meta{font-family:var(--font-mono);font-size:var(--fs-xs);color:var(--text-muted)}
.exds-check__blocker{color:var(--ex-red-600)}
.exds-check__right{display:flex;align-items:center;gap:12px;flex:none}
.exds-check__owner{font-family:var(--font-mono);font-size:var(--fs-xs);color:var(--text-muted)}
.exds-check__evi{display:inline-flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:600;
  letter-spacing:var(--ls-label);text-transform:uppercase;color:var(--ex-sky-500);text-decoration:none}
.exds-check__evi:hover{text-decoration:underline}
.exds-check__evi svg{width:13px;height:13px}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-check-css')) {
  const s = document.createElement('style'); s.id = 'exds-check-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

const Tick = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>);
const Link = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>);

/**
 * Exopter ChecklistRow — flight-prep / maintenance / test / acceptance item.
 * state: done | active | pending | blocked. Shows owner, blocker, and evidence link.
 */
export function ChecklistRow({ title, state = 'pending', owner, blocker, evidence, evidenceLabel = 'Evidence', className = '', ...rest }) {
  return (
    <div className={['exds-check', `exds-check--${state}`, className].filter(Boolean).join(' ')} {...rest}>
      <span className="exds-check__box">{state === 'done' && <Tick/>}</span>
      <div className="exds-check__body">
        <span className="exds-check__title">{title}</span>
        {blocker
          ? <span className="exds-check__meta exds-check__blocker">{blocker}</span>
          : state === 'active' && <span className="exds-check__meta">In progress</span>}
      </div>
      <div className="exds-check__right">
        {owner && <span className="exds-check__owner">{owner}</span>}
        {evidence && <a className="exds-check__evi" href={evidence}><Link/>{evidenceLabel}</a>}
      </div>
    </div>
  );
}
