/* @ds-bundle: {"format":3,"namespace":"ExopterDesignSystem_4c9fc9","components":[{"name":"Card","sourcePath":"components/data/Card.jsx"},{"name":"ChecklistRow","sourcePath":"components/data/ChecklistRow.jsx"},{"name":"MetricTile","sourcePath":"components/data/MetricTile.jsx"},{"name":"ReadinessStrip","sourcePath":"components/data/ReadinessStrip.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"StatusDot","sourcePath":"components/feedback/StatusDot.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"IconButton","sourcePath":"components/forms/IconButton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"}],"sourceHashes":{"components/data/Card.jsx":"21112a3b822e","components/data/ChecklistRow.jsx":"a65f225302a3","components/data/MetricTile.jsx":"16d8ec01dca3","components/data/ReadinessStrip.jsx":"a74b1a2d7c7a","components/feedback/Badge.jsx":"ed3d5fa3967f","components/feedback/StatusDot.jsx":"65531de7b02b","components/feedback/Toast.jsx":"c15cef79286f","components/forms/Button.jsx":"98a334076f79","components/forms/IconButton.jsx":"5ef77b4a398a","components/forms/Input.jsx":"feb96d51dc84","components/forms/SegmentedControl.jsx":"8d90ceffa950","components/forms/Select.jsx":"d8c19ae147bb","components/forms/Switch.jsx":"f37c4dcbd4cd","ui_kits/exopter-brand/Brand.jsx":"ad90dfd93dab","ui_kits/os-flight/FlightPrep.jsx":"a7eb66c5962f","ui_kits/os-flight/Hud.jsx":"f201690faeeb","ui_kits/os-flight/Logbook.jsx":"c50e48996a19","ui_kits/os-flight/Replay.jsx":"8c4a94939953","ui_kits/os-flight/Shell.jsx":"07d0b111e08f","ui_kits/os-flight/icons.jsx":"dfd5280e7f1c"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ExopterDesignSystem_4c9fc9 = window.ExopterDesignSystem_4c9fc9 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/data/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  const s = document.createElement('style');
  s.id = 'exds-card-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter Card — framed container for repeated items and tools.
 * Never nest a Card inside a Card. Use `surface="carbon"` for instrument panels.
 * elevation: flat | sm | raised
 */
function Card({
  eyebrow,
  title,
  actions,
  surface = 'light',
  elevation = 'sm',
  flush = false,
  children,
  className = '',
  ...rest
}) {
  const cls = ['exds-card', elevation === 'flat' ? 'exds-card--flat' : '', elevation === 'raised' ? 'exds-card--raised' : '', surface === 'carbon' ? 'ex-dark' : '', className].filter(Boolean).join(' ');
  const hasHead = eyebrow || title || actions;
  return /*#__PURE__*/React.createElement("section", _extends({
    className: cls
  }, rest), hasHead && /*#__PURE__*/React.createElement("header", {
    className: "exds-card__head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "exds-card__titles"
  }, eyebrow && /*#__PURE__*/React.createElement("span", {
    className: "exds-card__eyebrow"
  }, eyebrow), title && /*#__PURE__*/React.createElement("h3", {
    className: "exds-card__title"
  }, title)), actions && /*#__PURE__*/React.createElement("div", {
    className: "exds-card__actions"
  }, actions)), /*#__PURE__*/React.createElement("div", {
    className: ['exds-card__body', flush ? 'exds-card__body--flush' : ''].filter(Boolean).join(' ')
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Card.jsx", error: String((e && e.message) || e) }); }

// components/data/ChecklistRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  const s = document.createElement('style');
  s.id = 'exds-check-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const Tick = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "3",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M20 6 9 17l-5-5"
}));
const Link = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"
}), /*#__PURE__*/React.createElement("path", {
  d: "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"
}));

/**
 * Exopter ChecklistRow — flight-prep / maintenance / test / acceptance item.
 * state: done | active | pending | blocked. Shows owner, blocker, and evidence link.
 */
function ChecklistRow({
  title,
  state = 'pending',
  owner,
  blocker,
  evidence,
  evidenceLabel = 'Evidence',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['exds-check', `exds-check--${state}`, className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "exds-check__box"
  }, state === 'done' && /*#__PURE__*/React.createElement(Tick, null)), /*#__PURE__*/React.createElement("div", {
    className: "exds-check__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "exds-check__title"
  }, title), blocker ? /*#__PURE__*/React.createElement("span", {
    className: "exds-check__meta exds-check__blocker"
  }, blocker) : state === 'active' && /*#__PURE__*/React.createElement("span", {
    className: "exds-check__meta"
  }, "In progress")), /*#__PURE__*/React.createElement("div", {
    className: "exds-check__right"
  }, owner && /*#__PURE__*/React.createElement("span", {
    className: "exds-check__owner"
  }, owner), evidence && /*#__PURE__*/React.createElement("a", {
    className: "exds-check__evi",
    href: evidence
  }, /*#__PURE__*/React.createElement(Link, null), evidenceLabel)));
}
Object.assign(__ds_scope, { ChecklistRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ChecklistRow.jsx", error: String((e && e.message) || e) }); }

// components/data/MetricTile.jsx
try { (() => {
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
  const s = document.createElement('style');
  s.id = 'exds-metric-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter MetricTile — instrument readout with tabular numerals, unit, and optional delta.
 * state: default | ready | caution | fault | live ; trend: up | down | flat
 */
function MetricTile({
  label,
  icon = null,
  value,
  unit,
  delta,
  trend = 'flat',
  state = 'default',
  sunken = false,
  className = ''
}) {
  const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '–';
  return /*#__PURE__*/React.createElement("div", {
    className: ['exds-metric', state !== 'default' ? `exds-metric--${state}` : '', sunken ? 'exds-metric--sunken' : '', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("span", {
    className: "exds-metric__label"
  }, icon, label), /*#__PURE__*/React.createElement("span", {
    className: "exds-metric__value"
  }, value, unit && /*#__PURE__*/React.createElement("span", {
    className: "exds-metric__unit"
  }, unit)), delta != null && /*#__PURE__*/React.createElement("span", {
    className: `exds-metric__delta exds-metric__delta--${trend}`
  }, arrow, " ", delta));
}
Object.assign(__ds_scope, { MetricTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/MetricTile.jsx", error: String((e && e.message) || e) }); }

// components/data/ReadinessStrip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  const s = document.createElement('style');
  s.id = 'exds-strip-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter ReadinessStrip — dense horizontal status band (mode, pilot, weather,
 * battery, FDR, comms…). Each item carries an explicit value, never color-only.
 * mode: optional leading mode token. items: [{ label, value, state }]
 */
function ReadinessStrip({
  mode,
  items = [],
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['exds-strip', className].filter(Boolean).join(' ')
  }, rest), mode && /*#__PURE__*/React.createElement("div", {
    className: "exds-strip__mode"
  }, mode), items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `exds-strip__item is-${it.state || 'unknown'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "exds-strip__k"
  }, it.label), /*#__PURE__*/React.createElement("span", {
    className: "exds-strip__v"
  }, /*#__PURE__*/React.createElement("span", {
    className: ['exds-strip__dot', it.state === 'pending' ? 'exds-strip__dot--hollow' : ''].filter(Boolean).join(' ')
  }), /*#__PURE__*/React.createElement("span", {
    className: "exds-strip__vlabel"
  }, it.value)))));
}
Object.assign(__ds_scope, { ReadinessStrip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ReadinessStrip.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
const CSS = `
.exds-badge{display:inline-flex;align-items:center;gap:5px;
  font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:600;letter-spacing:var(--ls-label);text-transform:uppercase;
  height:20px;padding:0 8px;border-radius:var(--radius-compact);border:1px solid transparent;white-space:nowrap}
.exds-badge svg{width:12px;height:12px}
.exds-badge--neutral{background:var(--surface-panel);color:var(--text-muted);border-color:var(--border-rule)}
.exds-badge--ready{background:var(--ex-field-100);color:var(--ex-field-500);border-color:var(--ex-field-500)}
.exds-badge--live{background:var(--ex-aqua-100);color:#138577;border-color:var(--ex-aqua-500)}
.exds-badge--caution{background:var(--ex-amber-100);color:#9a5d12;border-color:var(--ex-amber-500)}
.exds-badge--fault{background:var(--ex-red-100);color:var(--ex-red-600);border-color:var(--ex-red-600)}
.exds-badge--info{background:var(--ex-sky-100);color:#1668a8;border-color:var(--ex-sky-500)}
.exds-badge--solid{background:var(--accent);color:var(--accent-contrast);border-color:var(--accent)}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-badge-css')) {
  const s = document.createElement('style');
  s.id = 'exds-badge-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter Badge — compact status / mode token. Always shows a label (never color-only).
 * tone: neutral | ready | live | caution | fault | info | solid
 */
function Badge({
  tone = 'neutral',
  icon = null,
  children,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: ['exds-badge', `exds-badge--${tone}`, className].filter(Boolean).join(' ')
  }, icon, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatusDot.jsx
try { (() => {
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
  const s = document.createElement('style');
  s.id = 'exds-statusdot-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter StatusDot — inline state indicator with uppercase label.
 * state: ready | live | pending | caution | fault | unknown
 */
function StatusDot({
  state = 'unknown',
  label,
  pulse = false,
  className = ''
}) {
  const hollow = state === 'pending';
  const text = label ?? state.toUpperCase();
  return /*#__PURE__*/React.createElement("span", {
    className: ['exds-statusdot', `exds-statusdot--${state}`, pulse ? 'exds-statusdot--pulse' : '', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("span", {
    className: ['exds-statusdot__dot', hollow ? 'exds-statusdot__dot--hollow' : ''].filter(Boolean).join(' ')
  }), /*#__PURE__*/React.createElement("span", {
    className: "exds-statusdot__label"
  }, text));
}
Object.assign(__ds_scope, { StatusDot });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatusDot.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
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
  const s = document.createElement('style');
  s.id = 'exds-toast-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const X = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M18 6 6 18M6 6l12 12"
}));

/**
 * Exopter Toast — transient operational notification.
 * tone: info | ready | caution | fault
 */
function Toast({
  tone = 'info',
  icon = null,
  title,
  children,
  onClose,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    className: ['exds-toast', `exds-toast--${tone}`, className].filter(Boolean).join(' ')
  }, icon && /*#__PURE__*/React.createElement("span", {
    className: "exds-toast__icon"
  }, icon), /*#__PURE__*/React.createElement("div", {
    className: "exds-toast__body"
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "exds-toast__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "exds-toast__msg"
  }, children)), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "exds-toast__close",
    "aria-label": "Dismiss",
    onClick: onClose
  }, /*#__PURE__*/React.createElement(X, null)));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Inject component CSS once (real hover/focus/active states, token-driven). */
const CSS = `
.exds-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  font-family:var(--font-ui);font-weight:600;font-size:var(--fs-body);
  line-height:1;white-space:nowrap;cursor:pointer;
  border-radius:var(--radius);border:1px solid transparent;
  height:var(--control-h);padding:0 16px;
  transition:background var(--dur) var(--ease-out),border-color var(--dur) var(--ease-out),color var(--dur) var(--ease-out);
  -webkit-font-smoothing:antialiased;
}
.exds-btn:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.exds-btn[disabled]{cursor:not-allowed;opacity:.45}
.exds-btn--sm{height:var(--control-h-sm);padding:0 12px;font-size:var(--fs-sm)}
.exds-btn--lg{height:var(--control-h-lg);padding:0 20px}
.exds-btn--block{width:100%}
.exds-btn svg{width:18px;height:18px;flex:none}

/* primary — carbon gradient, white text (matches app .primary-button) */
.exds-btn--primary{background:linear-gradient(135deg,var(--ex-carbon-800),var(--ex-carbon-950));color:#fff;border-color:transparent;box-shadow:0 10px 22px rgba(16,24,26,.2)}
.exds-btn--primary:hover:not([disabled]){filter:brightness(.96)}
.exds-btn--primary:active:not([disabled]){filter:brightness(.9)}

/* secondary — outline on surface */
.exds-btn--secondary{background:var(--surface-card);color:var(--text-body);border-color:var(--border-strong)}
.exds-btn--secondary:hover:not([disabled]){background:var(--surface-hover)}
.exds-btn--secondary:active:not([disabled]){background:var(--surface-panel)}

/* ghost — no chrome until hover */
.exds-btn--ghost{background:transparent;color:var(--text-body)}
.exds-btn--ghost:hover:not([disabled]){background:var(--surface-hover)}

/* danger — destructive / abort */
.exds-btn--danger{background:var(--ex-red-600);color:#fff;border-color:var(--ex-red-600)}
.exds-btn--danger:hover:not([disabled]){background:#cf322d}
.exds-btn--danger:active:not([disabled]){background:#b82b27}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-btn-css')) {
  const s = document.createElement('style');
  s.id = 'exds-btn-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter Button — primary operational control.
 * variant: primary | secondary | ghost | danger
 * size: sm | md | lg
 */
function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  iconLeft = null,
  iconRight = null,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const cls = ['exds-btn', `exds-btn--${variant}`, size !== 'md' ? `exds-btn--${size}` : '', block ? 'exds-btn--block' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cls
  }, rest), iconLeft, children != null && /*#__PURE__*/React.createElement("span", null, children), iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.exds-iconbtn{
  display:inline-flex;align-items:center;justify-content:center;
  border-radius:var(--radius);border:1px solid transparent;cursor:pointer;
  color:var(--text-body);background:transparent;
  width:var(--control-h);height:var(--control-h);flex:none;
  transition:background var(--dur) var(--ease-out),color var(--dur) var(--ease-out),border-color var(--dur) var(--ease-out);
}
.exds-iconbtn:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.exds-iconbtn[disabled]{cursor:not-allowed;opacity:.45}
.exds-iconbtn svg{width:18px;height:18px}
.exds-iconbtn--sm{width:var(--control-h-sm);height:var(--control-h-sm)}
.exds-iconbtn--sm svg{width:16px;height:16px}
.exds-iconbtn--lg{width:var(--control-h-lg);height:var(--control-h-lg)}
.exds-iconbtn--ghost:hover:not([disabled]){background:var(--surface-hover)}
.exds-iconbtn--outline{border-color:var(--border-strong);background:var(--surface-card)}
.exds-iconbtn--outline:hover:not([disabled]){background:var(--surface-hover)}
.exds-iconbtn--solid{background:var(--accent);color:var(--accent-contrast);border-color:var(--accent)}
.exds-iconbtn--solid:hover:not([disabled]){background:var(--ex-carbon-800)}
/* round — only when shape IS the control (play, target, reset) */
.exds-iconbtn--round{border-radius:var(--radius-round)}
.exds-iconbtn--danger{color:var(--ex-red-600)}
.exds-iconbtn--danger:hover:not([disabled]){background:var(--ex-red-100)}
`;
if (typeof document !== 'undefined' && !document.getElementById('exds-iconbtn-css')) {
  const s = document.createElement('style');
  s.id = 'exds-iconbtn-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter IconButton — compact single-icon control.
 * variant: ghost | outline | solid | danger ; size: sm | md | lg ; round for physical controls.
 */
function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  round = false,
  label,
  className = '',
  ...rest
}) {
  const cls = ['exds-iconbtn', `exds-iconbtn--${variant}`, size !== 'md' ? `exds-iconbtn--${size}` : '', round ? 'exds-iconbtn--round' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    "aria-label": label,
    title: label
  }, rest), icon);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  const s = document.createElement('style');
  s.id = 'exds-input-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter Input — labelled text/number field with optional prefix, unit suffix,
 * hint, and error state. Use `data` for right-aligned tabular numeric entry.
 */
function Input({
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
  return /*#__PURE__*/React.createElement("div", {
    className: ['exds-field', className].filter(Boolean).join(' ')
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "exds-field__label",
    htmlFor: fieldId
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "exds-field__req"
  }, "*")), /*#__PURE__*/React.createElement("div", {
    className: ['exds-input-wrap', error ? 'exds-input-wrap--error' : ''].filter(Boolean).join(' '),
    "data-disabled": rest.disabled ? 'true' : 'false'
  }, prefix && /*#__PURE__*/React.createElement("span", {
    className: "exds-input__affix"
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    id: fieldId,
    className: ['exds-input', data ? 'exds-input--data' : ''].filter(Boolean).join(' '),
    "aria-invalid": error ? 'true' : undefined
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    className: "exds-input__affix"
  }, suffix)), error ? /*#__PURE__*/React.createElement("span", {
    className: "exds-field__hint exds-field__hint--error"
  }, error) : hint && /*#__PURE__*/React.createElement("span", {
    className: "exds-field__hint"
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/SegmentedControl.jsx
try { (() => {
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
  const s = document.createElement('style');
  s.id = 'exds-seg-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter SegmentedControl — instrument-style mode switcher (e.g. GLD / EDF / JET).
 * Mode label is always visible; selection is never color-only.
 * options: [{ value, label, icon?, disabled? }]
 */
function SegmentedControl({
  options = [],
  value,
  defaultValue,
  onChange,
  size = 'md',
  ariaLabel = 'Mode',
  className = ''
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(defaultValue ?? (options[0] && options[0].value));
  const current = isControlled ? value : internal;
  const pick = v => {
    if (!isControlled) setInternal(v);
    onChange && onChange(v);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: ['exds-seg', size === 'lg' ? 'exds-seg--lg' : '', className].filter(Boolean).join(' '),
    role: "tablist",
    "aria-label": ariaLabel
  }, options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    role: "tab",
    "aria-selected": current === o.value,
    className: "exds-seg__btn",
    "data-active": current === o.value ? 'true' : 'false',
    disabled: o.disabled,
    onClick: () => pick(o.value)
  }, o.icon, o.label)));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  const s = document.createElement('style');
  s.id = 'exds-select-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const Chevron = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("polyline", {
  points: "6 9 12 15 18 9"
}));

/**
 * Exopter Select — native select with instrument-style chrome.
 * options: [{ value, label, disabled? }] (or pass children <option>s).
 */
function Select({
  label,
  options,
  id,
  className = '',
  children,
  ...rest
}) {
  const sid = id || (label ? `exds-sel-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return /*#__PURE__*/React.createElement("div", {
    className: ['exds-select-field', className].filter(Boolean).join(' ')
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "exds-select-field__label",
    htmlFor: sid
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "exds-select-wrap"
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: sid,
    className: "exds-select"
  }, rest), options ? options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value,
    disabled: o.disabled
  }, o.label)) : children), /*#__PURE__*/React.createElement("span", {
    className: "exds-select-wrap__chev"
  }, /*#__PURE__*/React.createElement(Chevron, null))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  const s = document.createElement('style');
  s.id = 'exds-switch-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Exopter Switch — physical-style on/off toggle. Field green when on.
 * Controlled via `checked` + `onChange`, or uncontrolled via `defaultChecked`.
 */
function Switch({
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  label,
  id,
  className = '',
  ...rest
}) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState(!!defaultChecked);
  const on = isControlled ? checked : internal;
  const handle = e => {
    if (!isControlled) setInternal(e.target.checked);
    onChange && onChange(e);
  };
  const sid = id || (label ? `exds-sw-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return /*#__PURE__*/React.createElement("label", {
    className: ['exds-switch', className].filter(Boolean).join(' '),
    "data-disabled": disabled ? 'true' : 'false',
    htmlFor: sid
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: sid,
    type: "checkbox",
    role: "switch",
    checked: on,
    disabled: disabled,
    onChange: handle
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "exds-switch__track",
    "data-on": on ? 'true' : 'false'
  }, /*#__PURE__*/React.createElement("span", {
    className: "exds-switch__thumb"
  })), label && /*#__PURE__*/React.createElement("span", {
    className: "exds-switch__label"
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// ui_kits/exopter-brand/Brand.jsx
try { (() => {
/* Exopter brand site — deep-tech, object-led public page. window.ExopterBrand. */
(function () {
  const DS = window.ExopterDesignSystem_4c9fc9;
  const {
    Button,
    Badge,
    MetricTile
  } = DS;
  const WING = '../../assets/exopter-wing-reference.jpeg';
  const Eyebrow = ({
    children,
    accent
  }) => /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: '.18em',
      textTransform: 'uppercase',
      color: accent ? 'var(--ex-aqua-500)' : 'var(--ex-graphite-400)'
    }
  }, children);
  const Reveal = ({
    children,
    style
  }) => /*#__PURE__*/React.createElement("div", {
    className: "reveal",
    style: style
  }, children);

  // ---- sections ----
  function Nav() {
    return /*#__PURE__*/React.createElement("header", {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '18px 40px',
        backdropFilter: 'blur(6px)',
        background: 'rgba(7,11,13,.55)',
        borderBottom: '1px solid rgba(255,255,255,.06)'
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: "../../assets/logo-wordmark.svg",
      alt: "EXOPTER",
      style: {
        height: 16
      }
    }), /*#__PURE__*/React.createElement("nav", {
      style: {
        display: 'flex',
        gap: 26,
        marginLeft: 28
      }
    }, ['Program', 'Evidence', 'Sillage', 'Roadmap'].map(l => /*#__PURE__*/React.createElement("a", {
      key: l,
      href: l === 'Sillage' ? '#sillage' : '#' + l.toLowerCase(),
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'var(--ex-graphite-400)',
        textDecoration: 'none'
      }
    }, l))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(Badge, {
      tone: "ready"
    }, "GLD validated"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Request brief"));
  }
  function Hero() {
    return /*#__PURE__*/React.createElement("section", {
      style: {
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-end',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: WING,
      alt: "Exopter rigid wing on a test field",
      style: {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(90deg, rgba(7,11,13,.88) 0%, rgba(7,11,13,.55) 42%, rgba(7,11,13,.15) 100%)'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(0deg, rgba(7,11,13,.95) 0%, rgba(7,11,13,0) 38%)'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        padding: '0 40px 84px',
        maxWidth: 1000
      }
    }, /*#__PURE__*/React.createElement(Eyebrow, {
      accent: true
    }, "Personal rigid-wing flight system"), /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: '18px 0 0',
        fontSize: 'clamp(48px, 7vw, 104px)',
        fontWeight: 700,
        lineHeight: .98,
        letterSpacing: '-.02em',
        color: 'var(--ex-white)'
      }
    }, "Human flight,", /*#__PURE__*/React.createElement("br", null), "made measurable."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '24px 0 0',
        fontSize: 19,
        lineHeight: 1.5,
        maxWidth: 560,
        color: 'var(--ex-vapor-100)'
      }
    }, "A rigid carbon wing from GLD glider validation to EPW electric power \u2014 built around flight-test evidence, pilot assistance, and the Sillage operating suite."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 12,
        marginTop: 30
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "primary"
    }, "View the program"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary"
    }, "Flight evidence"))), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        bottom: 24,
        right: 40,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--ex-graphite-400)'
      }
    }, "Exowing GLD \xB7 field reference \u2193"));
  }
  function SpecBand() {
    const specs = [{
      label: 'Optimal speed',
      value: '170–230',
      unit: 'km/h'
    }, {
      label: 'Wingspan',
      value: '2.5',
      unit: 'm'
    }, {
      label: 'GLD distance',
      value: '>10',
      unit: 'km'
    }, {
      label: 'EPW distance',
      value: '>25',
      unit: 'km'
    }, {
      label: 'Exit altitude',
      value: '5 000',
      unit: 'm'
    }, {
      label: 'Parachute',
      value: '1 500',
      unit: 'm'
    }];
    return /*#__PURE__*/React.createElement("section", {
      id: "program",
      className: "grid-bg",
      style: {
        background: 'var(--ex-carbon-950)',
        padding: '80px 40px',
        borderTop: '1px solid var(--ex-carbon-700)'
      }
    }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(Eyebrow, null, "Program truths"), /*#__PURE__*/React.createElement("h2", {
      style: {
        margin: '14px 0 0',
        fontSize: 'clamp(30px,4vw,46px)',
        fontWeight: 700,
        letterSpacing: '-.01em',
        color: 'var(--ex-white)',
        maxWidth: 680
      }
    }, "Validated as a glider first. Powered next."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '16px 0 40px',
        fontSize: 16,
        color: 'var(--ex-graphite-400)',
        maxWidth: 620
      }
    }, "One pilot, 80\u201395 kg. The first validated stage is GLD \u2014 an unpowered rigid wing proving aerodynamics, structure, safety, and FDR workflows before electric power is added.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
        gap: 1,
        background: 'var(--ex-carbon-700)',
        border: '1px solid var(--ex-carbon-700)',
        borderRadius: 8,
        overflow: 'hidden'
      }
    }, specs.map(s => /*#__PURE__*/React.createElement("div", {
      key: s.label,
      style: {
        background: 'var(--ex-carbon-900)',
        padding: '22px 20px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--ex-graphite-400)'
      }
    }, s.label), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-data)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 34,
        fontWeight: 500,
        color: 'var(--ex-white)',
        marginTop: 8,
        lineHeight: 1
      }
    }, s.value, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        color: 'var(--ex-graphite-400)',
        marginLeft: 4
      }
    }, s.unit))))));
  }
  function Evidence() {
    const mods = [{
      k: 'Wing',
      d: 'Rigid carbon airframe with pitot, pressure, GPS, and camera placement.'
    }, {
      k: 'FDR',
      d: 'Flight data recording with integrity state, import, and export.'
    }, {
      k: 'HUD',
      d: 'Sun-readable pilot display, fail-safe to black, GLD / EDF / JET modes.'
    }, {
      k: 'Parachute & jettison',
      d: 'Rescue parachute, attachment, harness, and emergency deactivation.'
    }, {
      k: 'Telemetry',
      d: 'Airspeed, altitude, glide, distance, temperature, and power traces.'
    }, {
      k: 'Test path',
      d: 'CFD, structural, tunnel, drop, and flight tests through acceptance.'
    }];
    return /*#__PURE__*/React.createElement("section", {
      id: "evidence",
      style: {
        background: 'var(--ex-carbon-900)',
        padding: '80px 40px'
      }
    }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(Eyebrow, {
      accent: true
    }, "Evidence"), /*#__PURE__*/React.createElement("h2", {
      style: {
        margin: '14px 0 40px',
        fontSize: 'clamp(30px,4vw,46px)',
        fontWeight: 700,
        letterSpacing: '-.01em',
        color: 'var(--ex-white)',
        maxWidth: 680
      }
    }, "The object is the proof.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
        gap: 16
      }
    }, mods.map(m => /*#__PURE__*/React.createElement("div", {
      key: m.k,
      className: "evi",
      style: {
        background: 'var(--ex-carbon-950)',
        border: '1px solid var(--ex-carbon-700)',
        borderRadius: 8,
        padding: '24px 22px',
        transition: 'border-color .2s'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'var(--ex-aqua-500)'
      }
    }, m.k), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '12px 0 0',
        fontSize: 15,
        lineHeight: 1.5,
        color: 'var(--ex-vapor-100)'
      }
    }, m.d)))));
  }
  function OperatingSuite() {
    const rooms = [['Flight', 'Prep, replay, logbook, maintenance'], ['Atlas', 'Maps, terrain, route comparison'], ['Hangar', 'Fleet, hardware, spare parts'], ['Signal', 'Telemetry, live feeds, comms'], ['Forge', 'Agent workflows, documentation'], ['Core', 'Auth, audit, storage, ops']];
    return /*#__PURE__*/React.createElement("section", {
      id: "os",
      style: {
        background: 'var(--ex-vapor-50)',
        padding: '80px 40px'
      }
    }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(Eyebrow, null, "Operating suite"), /*#__PURE__*/React.createElement("h2", {
      style: {
        margin: '14px 0 0',
        fontSize: 'clamp(30px,4vw,46px)',
        fontWeight: 700,
        letterSpacing: '-.01em',
        color: 'var(--ex-carbon-950)',
        maxWidth: 720
      }
    }, "Sillage \u2014 one workbench for the full flight lifecycle."), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '16px 0 36px',
        fontSize: 16,
        color: 'var(--ex-graphite-600)',
        maxWidth: 640
      }
    }, "Prepare, verify, record, replay, compare, inspect, train, certify. One house with several rooms \u2014 never a jump from the flight lab to an unrelated back office.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
        gap: 14,
        marginBottom: 28
      }
    }, rooms.map(([k, d]) => /*#__PURE__*/React.createElement("div", {
      key: k,
      style: {
        background: '#fff',
        border: '1px solid var(--ex-vapor-200)',
        borderRadius: 8,
        padding: '18px 18px',
        boxShadow: 'var(--shadow-sm)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 16,
        fontWeight: 600,
        color: 'var(--ex-carbon-950)'
      }
    }, "Sillage ", k), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: 'var(--ex-graphite-600)',
        marginTop: 4
      }
    }, d)))), /*#__PURE__*/React.createElement("a", {
      href: "../os-flight/index.html",
      style: {
        textDecoration: 'none'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "primary"
    }, "Open Sillage Flight \u2192")));
  }
  function Roadmap() {
    const stages = [{
      t: 'T0 → T0+12',
      k: 'GLD',
      d: 'Glider wing validation',
      s: 'validated'
    }, {
      t: 'T0+12 → T0+18',
      k: 'EPW / EDF',
      d: 'Electric-powered wing',
      s: 'dev'
    }, {
      t: 'T0+18 → T0+24',
      k: 'Bicopter',
      d: 'Stability & control',
      s: 'dev'
    }, {
      t: 'Beyond',
      k: 'JPW / P1000',
      d: 'Jet-powered extension',
      s: 'roadmap'
    }];
    const tone = {
      validated: 'ready',
      dev: 'caution',
      roadmap: 'neutral'
    };
    const lab = {
      validated: 'Validated',
      dev: 'In development',
      roadmap: 'Roadmap'
    };
    return /*#__PURE__*/React.createElement("section", {
      id: "roadmap",
      className: "grid-bg",
      style: {
        background: 'var(--ex-carbon-950)',
        padding: '80px 40px',
        borderTop: '1px solid var(--ex-carbon-700)'
      }
    }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(Eyebrow, {
      accent: true
    }, "Roadmap"), /*#__PURE__*/React.createElement("h2", {
      style: {
        margin: '14px 0 40px',
        fontSize: 'clamp(30px,4vw,46px)',
        fontWeight: 700,
        letterSpacing: '-.01em',
        color: 'var(--ex-white)',
        maxWidth: 680
      }
    }, "Maturity, stated honestly.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
        gap: 16
      }
    }, stages.map(st => /*#__PURE__*/React.createElement("div", {
      key: st.k,
      style: {
        background: 'var(--ex-carbon-900)',
        border: '1px solid var(--ex-carbon-700)',
        borderRadius: 8,
        padding: '22px 20px',
        borderTop: '2px solid ' + (st.s === 'validated' ? 'var(--ex-field-500)' : st.s === 'dev' ? 'var(--ex-amber-500)' : 'var(--ex-graphite-600)')
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '.08em',
        color: 'var(--ex-graphite-400)'
      }
    }, st.t), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 22,
        fontWeight: 700,
        color: 'var(--ex-white)',
        margin: '10px 0 2px',
        letterSpacing: '-.01em'
      }
    }, st.k), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        color: 'var(--ex-vapor-100)',
        marginBottom: 14
      }
    }, st.d), /*#__PURE__*/React.createElement(Badge, {
      tone: tone[st.s]
    }, lab[st.s])))));
  }
  function Footer() {
    return /*#__PURE__*/React.createElement("footer", {
      style: {
        background: 'var(--ex-carbon-950)',
        padding: '48px 40px',
        borderTop: '1px solid var(--ex-carbon-700)',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: "../../assets/logo-wordmark.svg",
      alt: "EXOPTER",
      style: {
        height: 16,
        opacity: .9
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'var(--ex-graphite-600)'
      }
    }, "Confidential \xB7 personal rigid-wing flight program \xB7 non-final marks"));
  }
  function Page() {
    React.useEffect(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const els = document.querySelectorAll('.reveal');
      if (reduce) {
        els.forEach(e => e.classList.add('in'));
        return;
      }
      const io = new IntersectionObserver(ents => ents.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }), {
        threshold: 0.18
      });
      els.forEach(e => io.observe(e));
      return () => io.disconnect();
    }, []);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--ex-carbon-950)'
      }
    }, /*#__PURE__*/React.createElement(Nav, null), /*#__PURE__*/React.createElement(Hero, null), /*#__PURE__*/React.createElement(SpecBand, null), /*#__PURE__*/React.createElement(Evidence, null), /*#__PURE__*/React.createElement(OperatingSuite, null), /*#__PURE__*/React.createElement(Roadmap, null), /*#__PURE__*/React.createElement(Footer, null));
  }
  window.ExopterBrand = {
    Page
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/exopter-brand/Brand.jsx", error: String((e && e.message) || e) }); }

// ui_kits/os-flight/FlightPrep.jsx
try { (() => {
/* Sillage Flight — Flight prep / readiness screen. window.OSFlightPrep. */
(function () {
  const {
    Icon
  } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const {
    Card,
    ChecklistRow,
    ReadinessStrip,
    MetricTile,
    Button,
    Switch,
    Badge
  } = DS;
  function SafetyGate({
    armed,
    onArm
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        border: '2px solid ' + (armed ? 'var(--ex-field-500)' : 'var(--ex-amber-500)'),
        borderRadius: 8,
        background: 'var(--surface-card)',
        padding: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: armed ? 'var(--ex-field-500)' : 'var(--ex-amber-500)',
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "shield",
      size: 18
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'var(--text-strong)'
      }
    }, "Safety gate \xB7 arm system")), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 14px',
        fontSize: 13,
        color: 'var(--text-muted)',
        maxWidth: 360
      }
    }, armed ? 'System armed. Parachute opening set 1500 m. Disarm before any ground handling.' : 'Requires human approval. All readiness items must pass before arming. This is a safety-critical action.'), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, armed ? /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "octagon-x",
        size: 18
      }),
      onClick: onArm
    }, "Disarm") : /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "shield",
        size: 18
      }),
      onClick: onArm
    }, "Arm system"), /*#__PURE__*/React.createElement(Badge, {
      tone: armed ? 'ready' : 'caution'
    }, armed ? 'Armed' : 'Awaiting approval')));
  }
  function FlightPrep() {
    const [armed, setArmed] = React.useState(false);
    const items = [{
      label: 'Pilot',
      value: 'A. Renaud · 88 kg',
      state: 'ready'
    }, {
      label: 'Weather',
      value: 'CAVOK · 6 kt',
      state: 'ready'
    }, {
      label: 'Battery',
      value: '74%',
      state: 'caution'
    }, {
      label: 'FDR',
      value: 'Armed',
      state: 'live'
    }, {
      label: 'Comms',
      value: 'VHF + intercom',
      state: 'ready'
    }, {
      label: 'Parachute',
      value: 'Check pending',
      state: 'pending'
    }];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 24,
        maxWidth: 1100,
        margin: '0 auto'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 18
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '-.01em',
        color: 'var(--text-strong)'
      }
    }, "Flight prep \xB7 GLD-2026-019"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '4px 0 0',
        fontSize: 14,
        color: 'var(--text-muted)'
      }
    }, "Verify GLD flight readiness before arming the system.")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 18
      }
    }, /*#__PURE__*/React.createElement(ReadinessStrip, {
      mode: "GLD",
      items: items
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr',
        gap: 16,
        alignItems: 'start'
      }
    }, /*#__PURE__*/React.createElement(Card, {
      eyebrow: "Pre-flight",
      title: "Readiness checklist",
      flush: true,
      actions: /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-muted)'
        }
      }, "4 / 7 passed")
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 4
      }
    }, /*#__PURE__*/React.createElement(ChecklistRow, {
      state: "done",
      title: "Harness, hooks & attachment inspected",
      owner: "PILOT",
      evidence: "#"
    }), /*#__PURE__*/React.createElement(ChecklistRow, {
      state: "done",
      title: "Wing surface & control check",
      owner: "ENG-2",
      evidence: "#"
    }), /*#__PURE__*/React.createElement(ChecklistRow, {
      state: "done",
      title: "Pitot / pressure probe clear",
      owner: "ENG-2",
      evidence: "#"
    }), /*#__PURE__*/React.createElement(ChecklistRow, {
      state: "active",
      title: "Parachute pack & jettison verified",
      owner: "ENG-1"
    }), /*#__PURE__*/React.createElement(ChecklistRow, {
      state: "blocked",
      title: "Battery above 80%",
      blocker: "At 74% \u2014 charge before EDF leg",
      owner: "OPS"
    }), /*#__PURE__*/React.createElement(ChecklistRow, {
      state: "pending",
      title: "Audible altimeter test",
      owner: "PILOT"
    }), /*#__PURE__*/React.createElement(ChecklistRow, {
      state: "pending",
      title: "Weather window confirmed",
      owner: "OPS"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(MetricTile, {
      label: "Wind",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "wind",
        size: 13
      }),
      value: "6",
      unit: "kt",
      state: "ready"
    }), /*#__PURE__*/React.createElement(MetricTile, {
      label: "OAT",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "thermometer",
        size: 13
      }),
      value: "19",
      unit: "\xB0C"
    }), /*#__PURE__*/React.createElement(MetricTile, {
      label: "Battery",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "battery",
        size: 13
      }),
      value: "74",
      unit: "%",
      state: "caution"
    }), /*#__PURE__*/React.createElement(MetricTile, {
      label: "Ceiling",
      value: "5 000",
      unit: "m"
    })), /*#__PURE__*/React.createElement(SafetyGate, {
      armed: armed,
      onArm: () => setArmed(a => !a)
    }), /*#__PURE__*/React.createElement(Card, {
      eyebrow: "Hardware",
      title: "Sensor placement",
      elevation: "flat"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }
    }, [['Wing', 'Pitot · GPS · camera'], ['Seat', 'Attitude · GPS · VHF'], ['Helmet', 'GPS · intercom · HUD']].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
      key: k,
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 13
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)'
      }
    }, k), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-body)'
      }
    }, v))))))));
  }
  window.OSFlightPrep = {
    FlightPrep
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/os-flight/FlightPrep.jsx", error: String((e && e.message) || e) }); }

// ui_kits/os-flight/Hud.jsx
try { (() => {
/* Sillage Flight — HUD preview (pilot display concept). window.OSHud. */
(function () {
  const {
    Icon
  } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const {
    SegmentedControl,
    Switch,
    Badge,
    Button
  } = DS;
  const G = '#8CFF4D',
    AMBER = '#F2A23A',
    GREY = '#5F6C6B';
  function Ladder({
    value,
    label,
    unit,
    x
  }) {
    // vertical tape with the current value boxed
    const rows = [-2, -1, 0, 1, 2];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: '50%',
        [x]: 40,
        transform: 'translateY(-50%)',
        textAlign: x === 'left' ? 'left' : 'right',
        fontFamily: 'var(--font-data)',
        fontVariantNumeric: 'tabular-nums',
        color: G
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '.12em',
        color: GREY,
        marginBottom: 6,
        textTransform: 'uppercase'
      }
    }, label), rows.map(r => /*#__PURE__*/React.createElement("div", {
      key: r,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: x === 'left' ? 'flex-start' : 'flex-end',
        opacity: r === 0 ? 1 : .4,
        height: 26
      }
    }, r === 0 ? /*#__PURE__*/React.createElement("span", {
      style: {
        border: '2px solid ' + G,
        padding: '2px 8px',
        fontSize: 30,
        fontWeight: 600,
        lineHeight: 1
      }
    }, value) : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16
      }
    }, value + r * (label === 'AIRSPEED' ? 5 : 50)))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: GREY,
        marginTop: 6
      }
    }, unit));
  }
  function Hud() {
    const [mode, setMode] = React.useState('gld');
    const [failsafe, setFailsafe] = React.useState(false);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 24,
        maxWidth: 1100,
        margin: '0 auto'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: 16,
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '-.01em',
        color: 'var(--text-strong)'
      }
    }, "HUD preview"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '4px 0 0',
        fontSize: 14,
        color: 'var(--text-muted)'
      }
    }, "Pilot display concept \xB7 readable in sun, fail-safe to black, never full white.")), /*#__PURE__*/React.createElement(SegmentedControl, {
      ariaLabel: "HUD mode",
      value: mode,
      onChange: setMode,
      options: [{
        value: 'gld',
        label: 'GLD'
      }, {
        value: 'edf',
        label: 'EDF'
      }, {
        value: 'jet',
        label: 'JET',
        disabled: true
      }]
    }), /*#__PURE__*/React.createElement(Switch, {
      label: "Fail-safe",
      checked: failsafe,
      onChange: e => setFailsafe(e.target.checked)
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        aspectRatio: '16 / 8',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid var(--ex-carbon-700)',
        background: failsafe ? '#070B0D' : 'linear-gradient(180deg,#0b1418 0%,#0a1012 52%,#0c0f0e 52%,#070b0d 100%)'
      }
    }, failsafe ? /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        letterSpacing: '.2em',
        color: GREY,
        textTransform: 'uppercase'
      }
    }, "Fail-safe \xB7 display blank"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: '#2a3433'
      }
    }, "Recover outside HUD context \u2014 no white flash")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '52%',
        height: 1,
        background: G,
        opacity: .5
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 22,
        fontFamily: 'var(--font-data)',
        fontVariantNumeric: 'tabular-nums',
        color: G,
        fontSize: 13,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        opacity: .4
      }
    }, "33"), /*#__PURE__*/React.createElement("span", {
      style: {
        opacity: .6
      }
    }, "N"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 18,
        fontWeight: 600,
        borderBottom: '2px solid ' + G,
        paddingBottom: 2
      }
    }, "036"), /*#__PURE__*/React.createElement("span", {
      style: {
        opacity: .6
      }
    }, "06"), /*#__PURE__*/React.createElement("span", {
      style: {
        opacity: .4
      }
    }, "09")), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%,-50%)',
        color: G
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "48",
      height: "48",
      viewBox: "0 0 48 48",
      fill: "none",
      stroke: G,
      strokeWidth: "2"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "24",
      cy: "24",
      r: "7"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "31",
      y1: "24",
      x2: "42",
      y2: "24"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "17",
      y1: "24",
      x2: "6",
      y2: "24"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "24",
      y1: "17",
      x2: "24",
      y2: "9"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: '34%',
        left: '63%',
        color: AMBER,
        textAlign: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 11
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "26",
      height: "34",
      viewBox: "0 0 26 34",
      fill: "none",
      stroke: AMBER,
      strokeWidth: "1.5"
    }, /*#__PURE__*/React.createElement("ellipse", {
      cx: "13",
      cy: "6",
      rx: "11",
      ry: "4"
    }), /*#__PURE__*/React.createElement("ellipse", {
      cx: "13",
      cy: "28",
      rx: "11",
      ry: "4"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "2",
      y1: "6",
      x2: "2",
      y2: "28"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "24",
      y1: "6",
      x2: "24",
      y2: "28"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 2
      }
    }, "WPT 2 \xB7 3.1 km")), /*#__PURE__*/React.createElement(Ladder, {
      value: 214,
      label: "AIRSPEED",
      unit: "km/h",
      x: "left"
    }), /*#__PURE__*/React.createElement(Ladder, {
      value: 1480,
      label: "ALTITUDE",
      unit: "m",
      x: "right"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 40,
        color: G,
        fontFamily: 'var(--font-data)',
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: GREY,
        letterSpacing: '.1em'
      }
    }, "GLIDE"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 22,
        fontWeight: 600
      }
    }, "12.4")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: GREY,
        letterSpacing: '.1em'
      }
    }, "DIST"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 22,
        fontWeight: 600
      }
    }, "8.6", /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: GREY
      }
    }, " km"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: GREY,
        letterSpacing: '.1em'
      }
    }, "TCAS"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 22,
        fontWeight: 600,
        color: GREY
      }
    }, "\u2014"))), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 12,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: AMBER,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.08em'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "triangle-alert",
      size: 13
    }), " BATT 74%"), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        bottom: 14,
        left: 16,
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '.12em',
        color: G
      }
    }, mode.toUpperCase()))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 20,
        marginTop: 14,
        flexWrap: 'wrap'
      }
    }, [['Primary data', G], ['Caution', AMBER], ['Inactive / unknown', GREY]].map(([k, c]) => /*#__PURE__*/React.createElement("span", {
      key: k,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        color: 'var(--text-muted)'
      }
    }, /*#__PURE__*/React.createElement("i", {
      style: {
        width: 10,
        height: 10,
        borderRadius: 2,
        background: c
      }
    }), " ", k))));
  }
  window.OSHud = {
    Hud
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/os-flight/Hud.jsx", error: String((e && e.message) || e) }); }

// ui_kits/os-flight/Logbook.jsx
try { (() => {
/* Sillage Flight — Logbook screen. window.OSLogbook. */
(function () {
  const {
    Icon
  } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const {
    Button,
    Input,
    Badge,
    StatusDot
  } = DS;
  const FLIGHTS = [{
    id: 'GLD-2026-018',
    mode: 'GLD',
    date: '14 Jun · 09:42',
    dur: '00:07:12',
    alt: '1 520',
    glide: '12.6',
    state: 'ready',
    label: 'Analysed'
  }, {
    id: 'GLD-2026-017',
    mode: 'GLD',
    date: '14 Jun · 08:15',
    dur: '00:06:48',
    alt: '1 480',
    glide: '12.4',
    state: 'ready',
    label: 'Analysed'
  }, {
    id: 'GLD-2026-016',
    mode: 'GLD',
    date: '11 Jun · 16:03',
    dur: '00:05:31',
    alt: '1 350',
    glide: '11.9',
    state: 'caution',
    label: 'Sensor flag'
  }, {
    id: 'EDF-2026-009',
    mode: 'EDF',
    date: '09 Jun · 11:27',
    dur: '00:11:54',
    alt: '2 100',
    glide: '—',
    state: 'live',
    label: 'Processing'
  }, {
    id: 'GLD-2026-015',
    mode: 'GLD',
    date: '07 Jun · 10:09',
    dur: '00:06:02',
    alt: '1 410',
    glide: '12.1',
    state: 'ready',
    label: 'Analysed'
  }, {
    id: 'GLD-2026-014',
    mode: 'GLD',
    date: '04 Jun · 15:44',
    dur: '00:04:58',
    alt: '1 280',
    glide: '11.6',
    state: 'fault',
    label: 'Pitot fault'
  }];
  const TH = {
    textAlign: 'left',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    padding: '0 16px 10px',
    whiteSpace: 'nowrap'
  };
  const TD = {
    padding: '13px 16px',
    borderTop: '1px solid var(--border-rule)',
    fontSize: 14,
    color: 'var(--text-body)',
    whiteSpace: 'nowrap'
  };
  const num = {
    fontFamily: 'var(--font-data)',
    fontVariantNumeric: 'tabular-nums'
  };
  function Logbook({
    onOpen
  }) {
    const [q, setQ] = React.useState('');
    const rows = FLIGHTS.filter(f => f.id.toLowerCase().includes(q.toLowerCase()));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 24,
        maxWidth: 1100,
        margin: '0 auto'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: 16,
        marginBottom: 20
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '-.01em',
        color: 'var(--text-strong)'
      }
    }, "Logbook"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '4px 0 0',
        fontSize: 14,
        color: 'var(--text-muted)'
      }
    }, "Recorded flights \u2014 replay, compare glide ratio, and inspect FDR.")), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 230
      }
    }, /*#__PURE__*/React.createElement(Input, {
      prefix: /*#__PURE__*/React.createElement(Icon, {
        name: "search",
        size: 16
      }),
      placeholder: "Search flight ID",
      value: q,
      onChange: e => setQ(e.target.value)
    })), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "upload",
        size: 18
      })
    }, "Import FDR")), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--surface-card)',
        border: '1px solid var(--border-rule)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: '100%',
        borderCollapse: 'collapse'
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
      style: {
        ...TH,
        paddingTop: 16
      }
    }, "Flight"), /*#__PURE__*/React.createElement("th", {
      style: {
        ...TH,
        paddingTop: 16
      }
    }, "Mode"), /*#__PURE__*/React.createElement("th", {
      style: {
        ...TH,
        paddingTop: 16
      }
    }, "Date"), /*#__PURE__*/React.createElement("th", {
      style: {
        ...TH,
        paddingTop: 16
      }
    }, "Duration"), /*#__PURE__*/React.createElement("th", {
      style: {
        ...TH,
        paddingTop: 16
      }
    }, "Max alt"), /*#__PURE__*/React.createElement("th", {
      style: {
        ...TH,
        paddingTop: 16
      }
    }, "Glide"), /*#__PURE__*/React.createElement("th", {
      style: {
        ...TH,
        paddingTop: 16
      }
    }, "Status"), /*#__PURE__*/React.createElement("th", {
      style: {
        ...TH,
        paddingTop: 16
      }
    }))), /*#__PURE__*/React.createElement("tbody", null, rows.map(f => /*#__PURE__*/React.createElement("tr", {
      key: f.id,
      onClick: () => onOpen(f),
      style: {
        cursor: 'pointer'
      },
      onMouseEnter: e => e.currentTarget.style.background = 'var(--surface-hover)',
      onMouseLeave: e => e.currentTarget.style.background = 'transparent'
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        ...TD,
        ...num,
        fontWeight: 600,
        color: 'var(--text-strong)'
      }
    }, f.id), /*#__PURE__*/React.createElement("td", {
      style: TD
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: f.mode === 'EDF' ? 'info' : 'solid'
    }, f.mode)), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TD,
        ...num,
        color: 'var(--text-muted)'
      }
    }, f.date), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TD,
        ...num
      }
    }, f.dur), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TD,
        ...num
      }
    }, f.alt, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-muted)',
        fontSize: 12
      }
    }, "m")), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TD,
        ...num
      }
    }, f.glide), /*#__PURE__*/React.createElement("td", {
      style: TD
    }, /*#__PURE__*/React.createElement(StatusDot, {
      state: f.state,
      label: f.label
    })), /*#__PURE__*/React.createElement("td", {
      style: {
        ...TD,
        textAlign: 'right',
        color: 'var(--text-muted)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-right",
      size: 16
    }))))))));
  }
  window.OSLogbook = {
    Logbook
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/os-flight/Logbook.jsx", error: String((e && e.message) || e) }); }

// ui_kits/os-flight/Replay.jsx
try { (() => {
/* Sillage Flight — Replay screen (dark instrument band). window.OSReplay. */
(function () {
  const {
    Icon
  } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const {
    IconButton,
    Button,
    MetricTile,
    Badge,
    StatusDot
  } = DS;

  // --- Synthetic flight samples (N points over the recording) ---
  const N = 120;
  const T_TOTAL = 432; // seconds (07:12)
  const samples = Array.from({
    length: N
  }, (_, i) => {
    const t = i / (N - 1);
    const alt = 1520 * (1 - t) + 40 * Math.sin(t * 9) + 30;
    const spd = 198 + 26 * Math.sin(t * 7 + 1) + 8 * Math.sin(t * 21);
    const gld = 12.6 - 1.2 * Math.sin(t * 5 + 0.5);
    const vs = -(4.6 + 1.8 * Math.sin(t * 7 + 1));
    const g = 1 + 0.35 * Math.sin(t * 17);
    return {
      alt,
      spd,
      gld,
      vs,
      g
    };
  });
  const fmtT = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // Build an SVG path string from accessor over viewBox w/h
  function pathFor(acc, min, max, w, h, pad) {
    return samples.map((s, i) => {
      const x = pad + i / (N - 1) * (w - 2 * pad);
      const y = pad + (1 - (acc(s) - min) / (max - min)) * (h - 2 * pad);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }
  function Replay({
    flight,
    onBack
  }) {
    const f = flight || {
      id: 'GLD-2026-018',
      mode: 'GLD'
    };
    const [idx, setIdx] = React.useState(Math.floor(N * 0.46));
    const [playing, setPlaying] = React.useState(false);
    const raf = React.useRef(null);
    React.useEffect(() => {
      if (!playing) return;
      let last = performance.now();
      const tick = now => {
        const dt = (now - last) / 1000;
        last = now;
        setIdx(p => {
          const next = p + dt * (N / T_TOTAL) * 6; // 6x speed
          if (next >= N - 1) {
            setPlaying(false);
            return N - 1;
          }
          return next;
        });
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf.current);
    }, [playing]);
    const i = Math.round(idx);
    const cur = samples[i];
    const tNow = i / (N - 1) * T_TOTAL;

    // trajectory band geometry
    const W = 760,
      H = 240,
      PAD = 24;
    const altPath = pathFor(s => s.alt, 0, 1600, W, H, PAD);
    const dotX = PAD + i / (N - 1) * (W - 2 * PAD);
    const dotY = PAD + (1 - cur.alt / 1600) * (H - 2 * PAD);

    // telemetry chart geometry
    const CW = 760,
      CH = 150,
      CPAD = 18;
    const spdPath = pathFor(s => s.spd, 150, 240, CW, CH, CPAD);
    const altMini = pathFor(s => s.alt, 0, 1600, CW, CH, CPAD);
    const scrubX = CPAD + i / (N - 1) * (CW - 2 * CPAD);
    const events = [{
      t: '00:00',
      label: 'T0 exit · 1520 m',
      state: 'ready'
    }, {
      t: '02:14',
      label: 'Best glide window',
      state: 'live'
    }, {
      t: '04:02',
      label: 'Airspeed dip −12 km/h',
      state: 'caution'
    }, {
      t: '07:12',
      label: 'Flare · landing',
      state: 'ready'
    }];
    return /*#__PURE__*/React.createElement("div", {
      className: "ex-dark",
      style: {
        minHeight: '100%',
        background: 'var(--ex-carbon-950)',
        color: 'var(--ex-vapor-50)',
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 20px',
        borderBottom: '1px solid var(--ex-carbon-700)'
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "chevron-right",
        size: 18,
        style: {
          transform: 'rotate(180deg)'
        }
      }),
      variant: "ghost",
      label: "Back to logbook",
      onClick: onBack
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-data)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 17,
        fontWeight: 600
      }
    }, f.id), /*#__PURE__*/React.createElement(Badge, {
      tone: f.mode === 'EDF' ? 'info' : 'solid'
    }, f.mode), /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral"
    }, "Replay"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "activity",
        size: 18
      })
    }, "Compare"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        name: "download",
        size: 18
      })
    }, "Export FDR")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 16,
        padding: 16,
        flex: 1,
        minHeight: 0,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: '1 1 600px',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--ex-carbon-900)',
        border: '1px solid var(--ex-carbon-700)',
        borderRadius: 8,
        padding: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--ex-graphite-400)'
      }
    }, "Altitude profile \xB7 side view"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--ex-graphite-400)'
      }
    }, "Exit \u2192 flare")), /*#__PURE__*/React.createElement("svg", {
      viewBox: `0 0 ${W} ${H}`,
      style: {
        width: '100%',
        height: 'auto',
        display: 'block'
      }
    }, [0, 0.25, 0.5, 0.75, 1].map(g => {
      const y = PAD + g * (H - 2 * PAD);
      return /*#__PURE__*/React.createElement("g", {
        key: g
      }, /*#__PURE__*/React.createElement("line", {
        x1: PAD,
        y1: y,
        x2: W - PAD,
        y2: y,
        stroke: "#21302F",
        strokeWidth: "1"
      }), /*#__PURE__*/React.createElement("text", {
        x: 4,
        y: y + 3,
        fill: "#5F6C6B",
        fontSize: "9",
        fontFamily: "var(--font-mono)"
      }, Math.round(1600 * (1 - g))));
    }), /*#__PURE__*/React.createElement("path", {
      d: `${altPath} L ${W - PAD} ${H - PAD} L ${PAD} ${H - PAD} Z`,
      fill: "rgba(47,214,198,.08)",
      stroke: "none"
    }), /*#__PURE__*/React.createElement("path", {
      d: altPath,
      fill: "none",
      stroke: "var(--ex-aqua-500)",
      strokeWidth: "2"
    }), /*#__PURE__*/React.createElement("line", {
      x1: dotX,
      y1: PAD,
      x2: dotX,
      y2: H - PAD,
      stroke: "#2FD6C6",
      strokeWidth: "1",
      strokeDasharray: "3 4",
      opacity: ".5"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: dotX,
      cy: dotY,
      r: "5",
      fill: "var(--ex-hud-green)",
      stroke: "#070B0D",
      strokeWidth: "1.5"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--ex-carbon-900)',
        border: '1px solid var(--ex-carbon-700)',
        borderRadius: 8,
        padding: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 16,
        marginBottom: 8,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--ex-graphite-400)'
      }
    }, "Telemetry"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--ex-vapor-50)'
      }
    }, /*#__PURE__*/React.createElement("i", {
      style: {
        width: 10,
        height: 2,
        background: 'var(--ex-sky-500)'
      }
    }), " Airspeed"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--ex-vapor-50)'
      }
    }, /*#__PURE__*/React.createElement("i", {
      style: {
        width: 10,
        height: 2,
        background: 'var(--ex-aqua-500)'
      }
    }), " Altitude")), /*#__PURE__*/React.createElement("svg", {
      viewBox: `0 0 ${CW} ${CH}`,
      style: {
        width: '100%',
        height: 'auto',
        display: 'block'
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: altMini,
      fill: "none",
      stroke: "var(--ex-aqua-500)",
      strokeWidth: "1.5",
      opacity: ".5"
    }), /*#__PURE__*/React.createElement("path", {
      d: spdPath,
      fill: "none",
      stroke: "var(--ex-sky-500)",
      strokeWidth: "2"
    }), /*#__PURE__*/React.createElement("line", {
      x1: scrubX,
      y1: 4,
      x2: scrubX,
      y2: CH - 4,
      stroke: "#8CFF4D",
      strokeWidth: "1"
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: '0 0 230px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(MetricTile, {
      label: "Airspeed",
      value: cur.spd.toFixed(0),
      unit: "km/h",
      state: "live",
      sunken: true
    }), /*#__PURE__*/React.createElement(MetricTile, {
      label: "Altitude",
      value: cur.alt.toFixed(0),
      unit: "m",
      sunken: true
    }), /*#__PURE__*/React.createElement(MetricTile, {
      label: "Glide",
      value: cur.gld.toFixed(1),
      unit: "L/D",
      state: "ready",
      sunken: true
    }), /*#__PURE__*/React.createElement(MetricTile, {
      label: "V-speed",
      value: cur.vs.toFixed(1),
      unit: "m/s",
      sunken: true
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--ex-carbon-900)',
        border: '1px solid var(--ex-carbon-700)',
        borderRadius: 8,
        padding: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--ex-graphite-400)'
      }
    }, "Events"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginTop: 10
      }
    }, events.map(e => /*#__PURE__*/React.createElement("div", {
      key: e.t,
      style: {
        display: 'flex',
        gap: 8,
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-data)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 12,
        color: 'var(--ex-graphite-400)',
        width: 42,
        flex: 'none'
      }
    }, e.t), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(StatusDot, {
      state: e.state,
      label: e.label
    })))))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 20px',
        borderTop: '1px solid var(--ex-carbon-700)',
        background: 'var(--ex-carbon-900)'
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: playing ? 'pause' : 'play',
        size: 18
      }),
      variant: "solid",
      round: true,
      label: playing ? 'Pause' : 'Play',
      onClick: () => setPlaying(p => !p)
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "rotate-ccw",
        size: 18
      }),
      variant: "ghost",
      label: "Restart",
      onClick: () => {
        setIdx(0);
        setPlaying(false);
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-data)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 13,
        color: 'var(--ex-hud-green)',
        width: 52
      }
    }, fmtT(tNow)), /*#__PURE__*/React.createElement("input", {
      type: "range",
      min: "0",
      max: N - 1,
      step: "1",
      value: i,
      onChange: e => {
        setPlaying(false);
        setIdx(Number(e.target.value));
      },
      style: {
        flex: 1,
        accentColor: '#2FD6C6',
        height: 4
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-data)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 13,
        color: 'var(--ex-graphite-400)',
        width: 52,
        textAlign: 'right'
      }
    }, fmtT(T_TOTAL))));
  }
  window.OSReplay = {
    Replay
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/os-flight/Replay.jsx", error: String((e && e.message) || e) }); }

// ui_kits/os-flight/Shell.jsx
try { (() => {
/* Sillage Flight — application shell: left rail + top header. Exposes window.OSShell. */
(function () {
  const {
    Icon
  } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const {
    SegmentedControl,
    IconButton,
    Badge
  } = DS;
  const ROOMS = [{
    id: 'flight',
    label: 'Flight',
    icon: 'plane'
  }, {
    id: 'atlas',
    label: 'Atlas',
    icon: 'map'
  }, {
    id: 'hangar',
    label: 'Hangar',
    icon: 'wrench'
  }, {
    id: 'signal',
    label: 'Signal',
    icon: 'signal'
  }, {
    id: 'forge',
    label: 'Forge',
    icon: 'layers'
  }, {
    id: 'core',
    label: 'Core',
    icon: 'shield'
  }];
  function Rail({
    room,
    onRoom
  }) {
    return /*#__PURE__*/React.createElement("nav", {
      style: {
        width: 64,
        flex: 'none',
        background: 'var(--ex-carbon-950)',
        color: 'var(--ex-vapor-50)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '14px 0',
        gap: 6,
        borderRight: '1px solid var(--ex-carbon-700)'
      }
    }, /*#__PURE__*/React.createElement("a", {
      href: "../../index.html",
      title: "Design system",
      style: {
        marginBottom: 10,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: "../../assets/app-icon.svg",
      alt: "Exopter",
      style: {
        width: 30,
        height: 30,
        borderRadius: 7
      }
    })), ROOMS.map(r => {
      const active = r.id === room;
      return /*#__PURE__*/React.createElement("button", {
        key: r.id,
        title: r.label,
        onClick: () => onRoom(r.id),
        style: {
          width: 44,
          height: 44,
          borderRadius: 8,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          background: active ? 'var(--ex-carbon-800)' : 'transparent',
          color: active ? 'var(--ex-aqua-500)' : 'var(--ex-graphite-400)',
          transition: 'background .18s, color .18s'
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        name: r.icon,
        size: 18
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 8,
          letterSpacing: '.06em',
          textTransform: 'uppercase'
        }
      }, r.label));
    }));
  }
  function Header({
    mode,
    onMode,
    title,
    crumb
  }) {
    return /*#__PURE__*/React.createElement("header", {
      style: {
        height: 56,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 20px',
        background: 'var(--ex-carbon-900)',
        color: 'var(--ex-vapor-50)',
        borderBottom: '1px solid var(--ex-carbon-700)'
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: "../../assets/logo-wordmark.svg",
      alt: "EXOPTER",
      style: {
        height: 16,
        opacity: .95
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 1,
        height: 22,
        background: 'var(--ex-carbon-700)'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        lineHeight: 1.15
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        color: 'var(--ex-graphite-400)'
      }
    }, "Sillage Flight \xB7 ", crumb), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 15,
        fontWeight: 600
      }
    }, title)), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "ex-dark"
    }, /*#__PURE__*/React.createElement(SegmentedControl, {
      ariaLabel: "Flight mode",
      defaultValue: "gld",
      options: [{
        value: 'gld',
        label: 'GLD'
      }, {
        value: 'edf',
        label: 'EDF'
      }, {
        value: 'jet',
        label: 'JET',
        disabled: true
      }],
      value: mode,
      onChange: onMode
    })), /*#__PURE__*/React.createElement("div", {
      className: "ex-dark"
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: "live"
    }, "T0+06:32")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: 'var(--ex-field-500)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        fontWeight: 600
      }
    }, "AR")));
  }
  function Shell({
    room,
    onRoom,
    mode,
    onMode,
    title,
    crumb,
    children
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        height: '100%',
        minHeight: 0,
        background: 'var(--surface-app)'
      }
    }, /*#__PURE__*/React.createElement(Rail, {
      room: room,
      onRoom: onRoom
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement(Header, {
      mode: mode,
      onMode: onMode,
      title: title,
      crumb: crumb
    }), /*#__PURE__*/React.createElement("main", {
      style: {
        flex: 1,
        minHeight: 0,
        overflow: 'auto'
      }
    }, children)));
  }
  window.OSShell = {
    Shell,
    ROOMS
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/os-flight/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/os-flight/icons.jsx
try { (() => {
/* Lucide-derived icon set for the Sillage Flight UI kit.
   24×24 grid, 2px stroke, round caps/joins — matches the documented Lucide system.
   window.OSIcons.Icon renders <Icon name="gauge" size={18} />. */
(function () {
  const P = {
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M9 4v13"/><path d="M15 7v13"/>',
    radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>',
    battery: '<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 11v2"/><path d="M10 11v2"/>',
    thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'triangle-alert': '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    'octagon-x': '<path d="M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    'rotate-ccw': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    'clipboard-check': '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    crosshair: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
    list: '<path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    signal: '<path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>',
    wind: '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
    'arrow-up-right': '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>'
  };
  function Icon({
    name,
    size = 18,
    strokeWidth = 2,
    className = '',
    style
  }) {
    return React.createElement('svg', {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className,
      style,
      dangerouslySetInnerHTML: {
        __html: P[name] || ''
      }
    });
  }
  window.OSIcons = {
    Icon,
    paths: P
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/os-flight/icons.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Card = __ds_scope.Card;

__ds_ns.ChecklistRow = __ds_scope.ChecklistRow;

__ds_ns.MetricTile = __ds_scope.MetricTile;

__ds_ns.ReadinessStrip = __ds_scope.ReadinessStrip;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.StatusDot = __ds_scope.StatusDot;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

})();
