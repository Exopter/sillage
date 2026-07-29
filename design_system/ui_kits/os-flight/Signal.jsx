/* Sillage Signal — live ground station with map, instruments, and chart views. */
(function () {
  const { Icon } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const { Badge, Button, StatusDot } = DS;

  const CSS = `
    .signal-root{min-height:100%;background:var(--ex-carbon-950);color:var(--ex-vapor-50)}
    .signal-status{display:grid;grid-template-columns:minmax(155px,1fr) minmax(140px,.9fr) 92px minmax(175px,.95fr) auto;min-height:58px;border-bottom:1px solid var(--ex-carbon-700);background:var(--ex-carbon-900)}
    .signal-status-cell{padding:8px 12px;border-right:1px solid var(--ex-carbon-700);min-width:0;display:flex;flex-direction:column;justify-content:center}
    .signal-status-cell .signal-k{margin-bottom:3px}
    .signal-status-sub{margin-top:3px;font:500 9px/1.15 var(--font-mono);letter-spacing:.04em;text-transform:uppercase;color:var(--ex-graphite-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .signal-link-stack{padding:6px 10px;border-right:1px solid var(--ex-carbon-700);display:grid;align-content:center;gap:3px;min-width:0}
    .signal-link-row{display:grid;grid-template-columns:56px minmax(0,1fr);align-items:center;gap:7px;font:600 9px/1.1 var(--font-mono);letter-spacing:.04em;text-transform:uppercase;color:var(--ex-graphite-400)}
    .signal-link-row b{color:var(--ex-field-500);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.signal-link-row b.caution{color:var(--ex-amber-500)}
    .signal-link-row .signal-dot{width:6px;height:6px;margin-right:5px}
    .signal-session-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;padding:8px 10px;min-width:0}
    .signal-k{display:block;font:600 10px/1.2 var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ex-graphite-400);margin-bottom:5px}
    .signal-v{font:600 13px/1.2 var(--font-data);color:var(--ex-vapor-50);font-variant-numeric:tabular-nums;white-space:nowrap}
    .signal-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ex-field-500);margin-right:7px}
    .signal-dot.live{background:var(--ex-aqua-500)}.signal-dot.caution{background:var(--ex-amber-500)}
    .signal-toolbar{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--ex-carbon-700);background:var(--ex-carbon-950)}
    .signal-toolbar .exds-segmented{background:var(--ex-carbon-900);border-color:var(--ex-carbon-700)}
    .signal-toolbar .exds-segmented__option{color:var(--ex-graphite-400)}
    .signal-toolbar .exds-segmented__option[aria-selected=true]{background:var(--ex-aqua-500);color:var(--ex-carbon-950)}
    .signal-panel{background:var(--ex-carbon-900);border:1px solid var(--ex-carbon-700);border-radius:8px;overflow:hidden}
    .signal-panel-head{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;border-bottom:1px solid var(--ex-carbon-700)}
    .signal-title{font:600 10px/1.2 var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ex-graphite-400)}
    .signal-map-grid{display:grid;grid-template-columns:minmax(0,1fr) 250px;min-height:465px}
    .signal-map{position:relative;min-height:465px;background:url(../../assets/landing-zone-terrain-v1.png) center/cover no-repeat}
    .signal-map:after{content:"";position:absolute;inset:0;background:rgba(7,11,13,.36)}
    .signal-lz{position:absolute;z-index:2;left:70%;top:52%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;color:var(--ex-hud-green)}
    .signal-lz-mark{width:56px;height:56px;border-radius:50%;border:2px solid currentColor;display:grid;place-items:center;background:rgba(7,11,13,.8);box-shadow:0 0 0 10px rgba(140,255,77,.08)}
    .signal-lz-label{margin-top:10px;padding:6px 9px;border-radius:4px;background:rgba(7,11,13,.88);font:600 11px/1.2 var(--font-mono);letter-spacing:.06em;white-space:nowrap}
    .signal-track{position:absolute;z-index:1;inset:0;width:100%;height:100%}
    .signal-vehicle{position:absolute;z-index:3;transform:translate(-50%,-50%);color:var(--ex-hud-green);transition:left .8s linear,top .8s linear}
    .signal-vehicle-icon{width:38px;height:38px;border:1px solid currentColor;border-radius:50%;display:grid;place-items:center;background:rgba(7,11,13,.84);box-shadow:0 0 0 7px rgba(140,255,77,.10)}
    .signal-vehicle-icon svg{filter:drop-shadow(0 0 4px rgba(140,255,77,.45))}
    .signal-vehicle-label{position:absolute;left:48px;top:-38px;min-width:190px;padding:6px 8px;border-radius:4px;background:rgba(7,11,13,.88);color:var(--ex-vapor-50);font:600 11px/1.35 var(--font-mono);letter-spacing:.03em;white-space:nowrap}
    .signal-vehicle-label strong{color:var(--ex-hud-green);font-weight:600}
    .signal-heading-line{position:absolute;left:50%;bottom:35px;height:72px;border-left:1px dashed rgba(140,255,77,.8);transform-origin:bottom center;pointer-events:none}
    .signal-side{border-left:1px solid var(--ex-carbon-700);padding:15px;display:flex;flex-direction:column;gap:14px}
    .signal-metric{display:flex;justify-content:space-between;align-items:baseline;gap:10px;border-bottom:1px solid var(--ex-carbon-700);padding-bottom:10px}
    .signal-metric strong{font:600 24px/1 var(--font-data);font-variant-numeric:tabular-nums;color:var(--ex-hud-green)}
    .signal-metric small{font:500 11px/1 var(--font-mono);color:var(--ex-graphite-400)}
    .signal-events{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    .signal-event-row{display:grid;grid-template-columns:58px 12px 1fr;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--ex-carbon-700);font-size:12px}
    .signal-event-row time{font-family:var(--font-data);color:var(--ex-graphite-400)}
    .signal-instruments{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:14px;padding:14px}
    .signal-canvas{width:100%;height:430px;display:block;background:#0a1113}
    .signal-charts{background:var(--ex-carbon-950);color:var(--ex-vapor-50);padding:14px;display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:14px}
    .signal-chart-panel{background:var(--ex-carbon-900);border:1px solid var(--ex-carbon-700);border-radius:8px;overflow:hidden;box-shadow:var(--ex-shadow-panel)}
    .signal-chart-panel .signal-panel-head{border-color:var(--ex-carbon-700)}
    .signal-chart-panel .signal-title{color:var(--ex-graphite-400)}
    .signal-charts-canvas{width:100%;height:440px;display:block;background:#0a1113}
    .signal-health{padding:14px}.signal-health h3{margin:4px 0 12px;font-size:18px;color:var(--ex-vapor-50)}
    .signal-health-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--ex-carbon-700);color:var(--ex-vapor-50);font:600 11px/1.2 var(--font-mono);letter-spacing:.04em;text-transform:uppercase}
    .signal-offline{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(242,162,58,.13);border:1px solid var(--ex-amber-500);border-radius:4px;color:#ffd18e;font:600 11px/1.2 var(--font-mono)}
    .signal-live-shell{height:100%;min-height:640px;display:flex;flex-direction:column;overflow:hidden}
    .signal-tool-button{height:32px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 10px;border:1px solid var(--ex-carbon-700);border-radius:5px;background:var(--ex-carbon-900);color:var(--ex-vapor-50);font:600 10px/1 var(--font-mono);letter-spacing:.04em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
    .signal-tool-button:hover,.signal-tool-button[aria-pressed=true]{border-color:var(--ex-aqua-500);color:var(--ex-aqua-500);background:rgba(47,214,198,.08)}
    .signal-tool-button.icon-only{width:34px;padding:0}
    .signal-dashboard{position:relative;flex:1;min-height:0;overflow:hidden;background:var(--ex-carbon-950)}
    .signal-dashboard:before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(74,92,94,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(74,92,94,.06) 1px,transparent 1px);background-size:28px 28px}
    .signal-workspace-panel{position:absolute;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--ex-carbon-900);border:1px solid var(--ex-carbon-700);border-radius:7px;overflow:hidden;box-shadow:0 14px 36px rgba(0,0,0,.34);transition:border-color .18s,box-shadow .18s,width .18s,height .18s,left .18s,top .18s}
    .signal-workspace-panel:hover{border-color:#405052}
    .signal-workspace-panel.is-active{border-color:#526265;box-shadow:0 18px 46px rgba(0,0,0,.48)}
    .signal-workspace-panel.is-hidden{box-shadow:0 8px 22px rgba(0,0,0,.3)}
    .signal-workspace-panel.is-hidden .signal-workspace-body{display:none}
    .signal-workspace-head{height:38px;box-sizing:border-box;flex:none;display:flex;align-items:center;gap:8px;padding:0 8px;border-bottom:1px solid var(--ex-carbon-700);background:rgba(16,23,25,.96);cursor:grab;touch-action:none;user-select:none}
    .signal-workspace-head:active{cursor:grabbing}.signal-workspace-panel.is-hidden .signal-workspace-head{border-bottom:0}
    .signal-drag-handle{display:flex;color:var(--ex-graphite-500)}
    .signal-workspace-head-icon{color:var(--ex-aqua-500);display:flex}.signal-workspace-head strong{font:600 10px/1 var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ex-vapor-50)}
    .signal-workspace-subtitle{font:500 9px/1 var(--font-mono);letter-spacing:.04em;text-transform:uppercase;color:var(--ex-graphite-400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .signal-workspace-head-actions{margin-left:auto;display:flex;align-items:center;gap:6px}
    .signal-widget-modes{display:flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--ex-carbon-700);border-radius:4px;background:var(--ex-carbon-950)}
    .signal-widget-mode{height:21px;padding:0 6px;border:0;border-radius:3px;background:transparent;color:var(--ex-graphite-400);font:600 8px/1 var(--font-mono);letter-spacing:.04em;text-transform:uppercase;cursor:pointer}
    .signal-widget-mode:hover{color:var(--ex-vapor-50)}.signal-widget-mode[aria-pressed=true]{background:var(--ex-carbon-700);color:var(--ex-aqua-500)}
    .signal-workspace-body{position:relative;flex:1;min-height:0;overflow:hidden}
    .signal-unified-map{position:absolute;inset:0;background:url(../../assets/landing-zone-terrain-v1.png) center/cover no-repeat}
    .signal-unified-map:after{content:"";position:absolute;inset:0;background:rgba(7,11,13,.34);pointer-events:none}
    .signal-unified-map .signal-lz{left:73%;top:50%}
    .signal-map-cache{position:absolute;z-index:4;left:12px;top:12px}
    .signal-map-event{position:absolute;z-index:4;right:12px;top:12px;max-width:250px;padding:7px 9px;border:1px solid var(--ex-carbon-700);border-radius:5px;background:rgba(7,11,13,.88);backdrop-filter:blur(8px);font:600 9px/1.35 var(--font-mono);letter-spacing:.03em;color:var(--ex-vapor-50)}.signal-map-event time{margin-right:7px;color:var(--ex-aqua-500)}
    .signal-unified-instruments{position:absolute;inset:0;background:#0a1113}
    .signal-unified-instruments .signal-canvas{height:100%;min-height:0}
    .signal-unified-charts{position:absolute;inset:0;display:grid;grid-template-columns:1fr;background:#0a1113}.signal-unified-charts .signal-charts-canvas{height:100%;min-height:0}
    .signal-workspace-panel.is-enlarged .signal-unified-charts{display:block}.signal-workspace-panel.is-enlarged .signal-chart-summary{position:absolute;z-index:3;right:18px;bottom:18px;width:250px;box-sizing:border-box;display:grid;grid-template-columns:1fr 1fr;gap:0 10px;border:1px solid var(--ex-carbon-700);border-radius:5px;background:rgba(7,11,13,.9);backdrop-filter:blur(8px)}.signal-workspace-panel.is-enlarged .signal-chart-summary>.signal-title,.signal-workspace-panel.is-enlarged .signal-chart-summary>h4{grid-column:1/-1}.signal-workspace-panel.is-enlarged .signal-chart-summary-row{font-size:7px}
    .signal-chart-summary{display:none;flex-direction:column;padding:9px 10px;border-left:1px solid var(--ex-carbon-700);background:rgba(16,23,25,.96)}.signal-chart-summary h4{margin:4px 0 8px;font-size:12px;color:var(--ex-vapor-50)}.signal-chart-summary-row{display:flex;justify-content:space-between;gap:6px;padding:6px 0;border-bottom:1px solid var(--ex-carbon-700);font:600 8px/1 var(--font-mono);letter-spacing:.04em;text-transform:uppercase;color:var(--ex-graphite-300)}.signal-chart-summary-row b{color:var(--ex-field-500)}.signal-chart-summary-row b.caution{color:var(--ex-amber-500)}
    .signal-workspace-panel.is-mini .signal-workspace-subtitle,.signal-workspace-panel.is-hidden .signal-workspace-subtitle{display:none}
    .signal-workspace-panel.is-mini .signal-map-event,.signal-workspace-panel.is-mini .signal-map-cache,.signal-workspace-panel.is-mini .signal-vehicle-label{display:none}
    .signal-workspace-panel.is-mini .signal-lz-label{font-size:8px}.signal-workspace-panel.is-mini .signal-lz-mark{width:38px;height:38px}.signal-workspace-panel.is-mini .signal-vehicle-icon{width:30px;height:30px}
    .signal-telemetry-strip{height:50px;flex:none;display:grid;grid-template-columns:repeat(5,minmax(88px,.72fr)) minmax(180px,1.35fr);border-top:1px solid var(--ex-carbon-700);background:var(--ex-carbon-900)}
    .signal-telemetry-item{min-width:0;padding:7px 12px;border-right:1px solid var(--ex-carbon-700);display:flex;flex-direction:column;justify-content:center}.signal-telemetry-item:last-child{border-right:0}
    .signal-telemetry-item span{font:600 8px/1 var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ex-graphite-400)}.signal-telemetry-item strong{margin-top:4px;font:600 15px/1 var(--font-data);color:var(--ex-hud-green);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.signal-telemetry-item small{font:500 8px/1 var(--font-mono);color:var(--ex-graphite-300)}
    .signal-presentation{position:fixed;z-index:300;inset:0;width:100vw;height:100dvh;min-height:0;background:var(--ex-carbon-950)}
    .signal-panel-map.is-enlarged .signal-lz{left:60%}
    .signal-home{min-height:calc(100vh - 56px);padding:28px;display:grid;place-items:center;background:var(--ex-carbon-950)}
    .signal-home-inner{width:min(920px,100%)}.signal-home-head{display:flex;align-items:flex-end;gap:16px;margin-bottom:18px}.signal-home-head>div:first-child{flex:1}.signal-home-head h1{margin:4px 0 5px;font-size:27px;color:var(--ex-vapor-50)}
    .signal-launch-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}.signal-launch-card{background:var(--ex-carbon-900);border:1px solid var(--ex-carbon-700);border-radius:8px;overflow:hidden}.signal-launch-body{padding:18px}.signal-launch-body h2{margin:6px 0 6px;color:var(--ex-vapor-50);font-size:20px}.signal-launch-body p{margin:0;color:var(--ex-graphite-400);font-size:13px;line-height:1.55}
    .signal-prep-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid var(--ex-carbon-700)}.signal-prep-row strong{display:block;font:600 12px var(--font-data);color:var(--ex-vapor-50)}.signal-prep-row span{display:block;margin-top:3px;font-size:11px;color:var(--ex-graphite-400)}
    .signal-rule{display:flex;gap:10px;padding:11px 0;border-bottom:1px solid var(--ex-carbon-700)}.signal-rule:last-child{border-bottom:0}.signal-rule-icon{width:28px;height:28px;flex:none;border-radius:6px;display:grid;place-items:center;background:var(--ex-carbon-800);color:var(--ex-aqua-500)}.signal-rule strong{display:block;color:var(--ex-vapor-50);font-size:12px}.signal-rule span{display:block;margin-top:4px;color:var(--ex-graphite-400);font-size:11px;line-height:1.45}
    .signal-backdrop{position:fixed;z-index:80;inset:0;background:rgba(7,11,13,.62);display:flex;justify-content:flex-end}.signal-drawer{width:min(500px,calc(100vw - 36px));height:100%;background:var(--surface-card);color:var(--text-body);box-shadow:-18px 0 48px rgba(7,11,13,.32);display:flex;flex-direction:column}.signal-drawer-head{display:flex;align-items:flex-start;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border-rule)}.signal-drawer-head h2{margin:4px 0;font-size:21px;color:var(--text-strong)}.signal-drawer-body{padding:18px 20px;overflow:auto;display:grid;gap:15px}.signal-drawer-foot{margin-top:auto;display:flex;justify-content:flex-end;gap:9px;padding:14px 20px;border-top:1px solid var(--border-rule)}
    .signal-choice{display:grid;grid-template-columns:1fr 1fr;gap:10px}.signal-choice button{padding:14px;border:1px solid var(--border-rule);border-radius:7px;background:var(--surface-card);text-align:left;cursor:pointer;color:var(--text-body)}.signal-choice button[data-active=true]{border-color:var(--ex-aqua-500);box-shadow:0 0 0 2px rgba(47,214,198,.13);background:var(--surface-hover)}.signal-choice strong{display:block;margin:8px 0 4px;color:var(--text-strong)}.signal-choice span{font-size:12px;line-height:1.4;color:var(--text-muted)}
    .signal-form-field{display:grid;gap:6px}.signal-form-field label{font:600 10px/1 var(--font-mono);letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted)}.signal-form-field select{width:100%;box-sizing:border-box;border:1px solid var(--border-rule);border-radius:6px;background:var(--surface-card);color:var(--text-body);padding:10px 11px;font:500 13px var(--font-sans)}
    .signal-detect{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;border:1px solid var(--ex-field-500);border-radius:7px;background:var(--ex-state-ready-bg)}.signal-detect strong{display:block;margin-top:5px;font:600 13px var(--font-data);color:var(--text-strong)}.signal-help{padding:11px 12px;border-radius:6px;background:var(--surface-panel);font-size:12px;line-height:1.5;color:var(--text-muted)}.signal-close{width:34px;height:34px;border:1px solid var(--border-rule);border-radius:6px;background:var(--surface-card);color:var(--text-muted);display:grid;place-items:center;cursor:pointer}
    @media(max-width:1100px){.signal-status{grid-template-columns:minmax(130px,1fr) minmax(120px,.9fr) 76px minmax(145px,.9fr) auto}.signal-status-cell,.signal-link-stack{padding-left:8px;padding-right:8px}.signal-session-actions{gap:5px;padding-left:7px;padding-right:7px}.signal-session-actions .signal-action-label--optional{display:none}.signal-tool-button{padding:0 8px}.signal-telemetry-item{padding-left:8px;padding-right:8px}}
    @media(max-width:900px){.signal-map-grid,.signal-instruments,.signal-charts,.signal-launch-grid{grid-template-columns:1fr}.signal-side{border-left:0;border-top:1px solid var(--ex-carbon-700)}.signal-vehicle-label{min-width:150px;font-size:10px}.signal-choice,.signal-detect{grid-template-columns:1fr}.signal-live-shell{min-height:700px}.signal-workspace-head-actions .exds-badge{display:none}.signal-widget-mode{padding:0 5px}.signal-telemetry-strip{grid-template-columns:repeat(5,minmax(70px,.72fr)) minmax(140px,1.2fr)}}
  `;
  if (!document.getElementById('signal-screen-css')) { const s = document.createElement('style'); s.id = 'signal-screen-css'; s.textContent = CSS; document.head.appendChild(s); }

  function Signal({ onNavigate, activeFlight, preparationFlights, onStartSession, onEndSession }) {
    const [panelModes, setPanelModes] = React.useState({ map: 'enlarged', instruments: 'mini', charts: 'mini' });
    const [presentation, setPresentation] = React.useState(false);
    const [cloudLive, setCloudLive] = React.useState(true);
    const [startOpen, setStartOpen] = React.useState(false);
    const [events, setEvents] = React.useState([
      { t: '12:08:10', label: 'Exit detected', state: 'ready' },
      { t: '12:08:22', label: 'Radio link established', state: 'live' },
      { t: '12:11:03', label: 'Pitot differential flag', state: 'caution' },
    ]);
    const markEvent = () => setEvents((e) => [...e, { t: '12:14:50', label: `Operator marker ${e.length - 2}`, state: 'live' }]);
    const setPanelMode = (id, mode) => setPanelModes((current) => {
      const next = { ...current, [id]: mode };
      if (mode === 'enlarged') ['map', 'instruments', 'charts'].forEach((other) => { if (other !== id && next[other] === 'enlarged') next[other] = 'mini'; });
      return next;
    });
    if (!activeFlight) return <SignalHome preparations={preparationFlights} onStart={()=>setStartOpen(true)}>{startOpen && <SignalStartDrawer preparations={preparationFlights} onClose={()=>setStartOpen(false)} onStart={onStartSession}/>}</SignalHome>;
    return (
      <div className={`signal-root ex-dark signal-live-shell ${presentation ? 'signal-presentation' : ''}`}>
        <div className="signal-status">
          <StatusCell k="Active flight" v={activeFlight.id} sub={`${activeFlight.aircraft} · attached`} />
          <StatusCell k="Landing zone" v={activeFlight.zone} />
          <StatusCell k="Elapsed" v="T0+06:32" live />
          <LinkStack cloudLive={cloudLive} />
          <div className="signal-session-actions">
            <button className="signal-tool-button" aria-pressed={presentation} onClick={()=>setPresentation((v)=>!v)}><Icon name={presentation?'x':'arrow-up-right'} size={14}/><span className="signal-action-label--optional">{presentation?'Exit full screen':'Full screen'}</span></button>
            <button className="signal-tool-button icon-only" aria-label={cloudLive?'Simulate Internet cut':'Restore Internet'} title={cloudLive?'Simulate Internet cut':'Restore Internet'} onClick={() => setCloudLive((v) => !v)}><Icon name={cloudLive?'signal':'rotate-ccw'} size={14}/></button>
            <button className="signal-tool-button" onClick={onEndSession}>End session</button>
            <button className="signal-tool-button" onClick={markEvent}><Icon name="plus" size={15}/><span>Mark event</span></button>
          </div>
        </div>
        <UnifiedDashboard panelModes={panelModes} onPanelMode={setPanelMode} flight={activeFlight} cloudLive={cloudLive} events={events} onNavigate={onNavigate} />
        <TelemetryStrip flight={activeFlight} />
      </div>
    );
  }

  function SignalHome({ preparations, onStart, children }) {
    return <div className="signal-root ex-dark"><div className="signal-home"><div className="signal-home-inner"><div className="signal-home-head"><div><span className="signal-title">Ground station</span><h1>Signal sessions</h1><p style={{margin:0,color:'var(--ex-graphite-400)',fontSize:13}}>Start live acquisition from a prepared Flight, or let Signal create one.</p></div><Button iconLeft={<Icon name="radio" size={17}/>} onClick={onStart}>Start live session</Button></div><div className="signal-launch-grid"><section className="signal-launch-card"><div className="signal-panel-head"><span className="signal-title">Flights ready for Signal</span><Badge tone="neutral">{preparations.length}</Badge></div>{preparations.map((f)=><div className="signal-prep-row" key={f.id}><span className="signal-rule-icon"><Icon name="plane" size={16}/></span><div style={{flex:1}}><strong>{f.id} · {f.aircraft}</strong><span>{f.zone} · planned {f.date}</span></div><StatusDot state="unknown" label="Preparation"/></div>)}</section><section className="signal-launch-card"><div className="signal-panel-head"><span className="signal-title">Automatic Flight rule</span></div><div className="signal-launch-body"><h2>No telemetry is orphaned</h2><p>Every live session belongs to a Flight, even when the operator starts from Signal.</p><div style={{marginTop:15}}><Rule icon="clipboard-check" title="Prepared Flight selected" copy="Signal inherits the Flight ID, aircraft, and landing zone."/><Rule icon="search" title="Context detected" copy="Device identity and position prefill aircraft and landing zone."/><Rule icon="file-text" title="Context unresolved" copy="Signal creates a Flight with To complete fields for later review."/></div></div></section></div></div></div>{children}</div>;
  }

  function SignalStartDrawer({ preparations, onClose, onStart }) {
    const [mode,setMode]=React.useState(preparations.length?'existing':'automatic');
    const [flightId,setFlightId]=React.useState(preparations[0]?.id || '');
    return <div className="signal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><aside className="signal-drawer" role="dialog" aria-modal="true" aria-label="Start live session"><div className="signal-drawer-head"><div style={{flex:1}}><span style={{fontFamily:'var(--font-mono)',fontSize:10,fontWeight:600,letterSpacing:'.09em',textTransform:'uppercase',color:'var(--text-muted)'}}>Signal acquisition</span><h2>Start live session</h2><p style={{margin:'4px 0 0',fontSize:13,color:'var(--text-muted)'}}>Choose how this session should be attached to a Flight.</p></div><button className="signal-close" aria-label="Close" onClick={onClose}><Icon name="x" size={17}/></button></div><div className="signal-drawer-body"><div className="signal-choice"><button data-active={mode==='existing'} onClick={()=>setMode('existing')}><Icon name="clipboard-check" size={19}/><strong>Use prepared Flight</strong><span>Attach Signal to a Flight already in Preparation.</span></button><button data-active={mode==='automatic'} onClick={()=>setMode('automatic')}><Icon name="plus" size={19}/><strong>Create automatically</strong><span>Create a Flight as soon as acquisition starts.</span></button></div>{mode==='existing'?<><div className="signal-form-field"><label>Prepared Flight</label><select value={flightId} onChange={(e)=>setFlightId(e.target.value)}>{preparations.map((f)=><option key={f.id} value={f.id}>{f.id} · {f.aircraft} · {f.zone}</option>)}</select></div><div className="signal-help">The selected Flight moves from Preparation to Live and receives this Signal session automatically.</div></>:<><div className="signal-detect"><div><span style={{fontFamily:'var(--font-mono)',fontSize:10,fontWeight:600,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text-muted)'}}>Aircraft detected</span><strong>EXO-001</strong></div><div><span style={{fontFamily:'var(--font-mono)',fontSize:10,fontWeight:600,letterSpacing:'.07em',textTransform:'uppercase',color:'var(--text-muted)'}}>Zone detected</span><strong>Tournon Valley</strong></div></div><div className="signal-help">Signal creates a Flight with default values. Detected context is filled now; anything unresolved is stored as To complete without blocking capture.</div></>}</div><div className="signal-drawer-foot"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button iconLeft={<Icon name="radio" size={16}/>} onClick={()=>onStart({mode,flightId,aircraft:'EXO-001',zone:'Tournon Valley'})}>Start acquisition</Button></div></aside></div>;
  }

  function Rule({icon,title,copy}) { return <div className="signal-rule"><span className="signal-rule-icon"><Icon name={icon} size={15}/></span><div><strong>{title}</strong><span>{copy}</span></div></div>; }

  function StatusCell({ k, v, sub, live, caution }) { return <div className="signal-status-cell"><span className="signal-k">{k}</span><span className="signal-v"><i className={`signal-dot ${live ? 'live' : ''} ${caution ? 'caution' : ''}`} />{v}</span>{sub&&<span className="signal-status-sub">{sub}</span>}</div>; }

  function LinkStack({ cloudLive }) {
    return <div className="signal-link-stack" aria-label="Capture and synchronization status"><LinkRow label="Radio" value="Linked · −78 dBm"/><LinkRow label="Recorder" value="Local capture"/><LinkRow label="Cloud" value={cloudLive?'Live':'18 s behind'} caution={!cloudLive}/></div>;
  }

  function LinkRow({label,value,caution}) { return <div className="signal-link-row"><span>{label}</span><b className={caution?'caution':''}><i className={`signal-dot ${caution?'caution':''}`}/>{value}</b></div>; }

  function TelemetryStrip({ flight }) {
    return <footer className="signal-telemetry-strip" aria-label="Shared live telemetry"><TelemetryValue label="Heading" value="036" unit="deg"/><TelemetryValue label="Airspeed" value="214" unit="km/h"/><TelemetryValue label="Altitude" value="1 480" unit="m AMSL"/><TelemetryValue label="Vertical speed" value="−4.6" unit="m/s"/><TelemetryValue label="Glide" value="12.4" unit="L/D"/><TelemetryValue label="Landing zone" value={`${flight.zone} · 8.6 km`}/></footer>;
  }

  function TelemetryValue({label,value,unit}) { return <div className="signal-telemetry-item"><span>{label}</span><strong>{value}{unit&&<> <small>{unit}</small></>}</strong></div>; }

  function panelLayout(size, modes) {
    const ids=['map','instruments','charts'], pad=8, gap=8, width=Math.max(0,size.width), height=Math.max(0,size.height);
    const enlarged=ids.find((id)=>modes[id]==='enlarged');
    const rects={};
    if(enlarged) {
      const sideIds=ids.filter((id)=>id!==enlarged), sideWidth=Math.min(340,Math.max(270,Math.round(width*.28)));
      const mainWidth=Math.max(360,width-sideWidth-gap-pad*2);
      rects[enlarged]={left:pad,top:pad,width:mainWidth,height:Math.max(180,height-pad*2)};
      const hiddenCount=sideIds.filter((id)=>modes[id]==='hidden').length, miniCount=sideIds.length-hiddenCount;
      const usable=Math.max(120,height-pad*2-gap*(sideIds.length-1)), miniHeight=miniCount?Math.max(120,(usable-hiddenCount*38)/miniCount):38;
      let top=pad;
      sideIds.forEach((id)=>{const panelHeight=modes[id]==='hidden'?38:miniHeight;rects[id]={left:pad+mainWidth+gap,top,width:sideWidth,height:panelHeight};top+=panelHeight+gap;});
      return rects;
    }
    const columnWidth=Math.max(230,(width-pad*2-gap*2)/3);
    ids.forEach((id,index)=>{rects[id]={left:pad+index*(columnWidth+gap),top:pad,width:columnWidth,height:modes[id]==='hidden'?38:Math.min(270,Math.max(150,height-pad*2))};});
    return rects;
  }

  function UnifiedDashboard({ panelModes, onPanelMode, flight, cloudLive, events, onNavigate }) {
    const boardRef=React.useRef(null);
    const [size,setSize]=React.useState({width:1200,height:620});
    const [offsets,setOffsets]=React.useState({map:{x:0,y:0},instruments:{x:0,y:0},charts:{x:0,y:0}});
    const [active,setActive]=React.useState('map');
    React.useLayoutEffect(()=>{const node=boardRef.current;if(!node)return;const measure=()=>setSize({width:node.clientWidth,height:node.clientHeight});measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[]);
    const rects=panelLayout(size,panelModes);
    const changeMode=(id,mode)=>{setOffsets((current)=>({...current,[id]:{x:0,y:0}}));setActive(id);onPanelMode(id,mode);};
    const startDrag=(event,id)=>{
      if(event.button!==0||event.target.closest('button'))return;
      event.preventDefault();setActive(id);
      const panel=event.currentTarget.parentElement,board=boardRef.current,panelRect=panel.getBoundingClientRect(),boardRect=board.getBoundingClientRect(),startX=event.clientX,startY=event.clientY,startOffset=offsets[id];
      const move=(next)=>{const dx=next.clientX-startX,dy=next.clientY-startY;const left=Math.min(Math.max(panelRect.left+dx,boardRect.left),boardRect.right-panelRect.width),top=Math.min(Math.max(panelRect.top+dy,boardRect.top),boardRect.bottom-panelRect.height);setOffsets((current)=>({...current,[id]:{x:startOffset.x+left-panelRect.left,y:startOffset.y+top-panelRect.top}}));};
      const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});
    };
    const panelStyle=(id)=>({...rects[id],transform:`translate(${offsets[id].x}px, ${offsets[id].y}px)`,zIndex:active===id?8:panelModes[id]==='enlarged'?1:4});
    return <main ref={boardRef} className="signal-dashboard" aria-label="Movable live Signal widgets">
      <WorkspacePanel id="map" title="Live map" subtitle="Flight path, heading and landing zone" icon="map" mode={panelModes.map} style={panelStyle('map')} active={active==='map'} onMode={changeMode} onDragStart={startDrag}><UnifiedMap key={`map-${panelModes.map}`} flight={flight} events={events} onNavigate={onNavigate}/></WorkspacePanel>
      <WorkspacePanel id="instruments" title="Instruments" subtitle="Ground-reconstructed flight state" icon="gauge" mode={panelModes.instruments} style={panelStyle('instruments')} active={active==='instruments'} onMode={changeMode} onDragStart={startDrag}><UnifiedInstruments key={`instruments-${panelModes.instruments}`}/></WorkspacePanel>
      <WorkspacePanel id="charts" title="Charts" subtitle="Aligned telemetry and stream validity" icon="activity" mode={panelModes.charts} style={panelStyle('charts')} active={active==='charts'} onMode={changeMode} onDragStart={startDrag}><UnifiedCharts key={`charts-${panelModes.charts}`} cloudLive={cloudLive} enlarged={panelModes.charts==='enlarged'}/></WorkspacePanel>
    </main>;
  }

  function WorkspacePanel({ id, title, subtitle, icon, mode, style, active, onMode, onDragStart, children }) {
    return <section className={`signal-workspace-panel signal-panel-${id} is-${mode} ${active?'is-active':''}`} style={style} aria-label={title} data-widget={id} data-mode={mode}>
      <header className="signal-workspace-head" onPointerDown={(event)=>onDragStart(event,id)} title={`Drag ${title}`}><span className="signal-drag-handle"><Icon name="menu" size={13}/></span><span className="signal-workspace-head-icon"><Icon name={icon} size={15}/></span><strong>{title}</strong><span className="signal-workspace-subtitle">{subtitle}</span><span className="signal-workspace-head-actions"><Badge tone="live">Live</Badge><span className="signal-widget-modes" aria-label={`${title} size`}><ModeButton label="Large" pressed={mode==='enlarged'} onClick={()=>onMode(id,'enlarged')}/><ModeButton label="Mini" pressed={mode==='mini'} onClick={()=>onMode(id,'mini')}/><ModeButton label="Hide" pressed={mode==='hidden'} onClick={()=>onMode(id,'hidden')}/></span></span></header>
      <div className="signal-workspace-body">{children}</div>
    </section>;
  }

  function ModeButton({label,pressed,onClick}) { return <button className="signal-widget-mode" aria-pressed={pressed} onPointerDown={(event)=>event.stopPropagation()} onClick={onClick}>{label}</button>; }

  function UnifiedMap({ flight, events, onNavigate }) {
    const latest=events[events.length-1];
    return <div className="signal-unified-map"><LiveFlightTrack flight={flight}/><button className="signal-lz" onClick={()=>onNavigate('atlas')} style={{border:0,background:'none',cursor:'pointer'}}><span className="signal-lz-mark"><Icon name="crosshair" size={23}/></span><span className="signal-lz-label">LANDING ZONE · {flight.zone.toUpperCase()} · 8.6 km</span></button><div className="signal-map-cache"><Badge tone="neutral">Terrain cached · 09:08 UTC</Badge></div>{latest&&<div className="signal-map-event"><time>{latest.t}</time>{latest.label}</div>}</div>;
  }

  function UnifiedInstruments() {
    return <div className="signal-unified-instruments"><AttitudeCanvas/></div>;
  }

  function UnifiedCharts({cloudLive,enlarged}) {
    return <div className="signal-unified-charts"><ChartsCanvas cloudLive={cloudLive} compact={!enlarged}/><aside className="signal-chart-summary"><span className="signal-title">Stream health</span><h4>{cloudLive?'Streams healthy':'Cloud reconnecting'}</h4><ChartHealth label="GNSS" value="Valid"/><ChartHealth label="IMU" value="Valid"/><ChartHealth label="Pitot" value="Monitor" caution/><ChartHealth label="Radio" value="Nominal"/><ChartHealth label="Cloud" value={cloudLive?'Live':'18 s behind'} caution={!cloudLive}/></aside></div>;
  }

  function ChartHealth({label,value,caution}) { return <div className="signal-chart-summary-row"><span>{label}</span><b className={caution?'caution':''}>{value}</b></div>; }

  function MapView({ events, onNavigate, cloudLive, flight }) {
    return <div style={{ padding: 14 }}>
      <div className="signal-panel signal-map-grid">
        <div className="signal-map">
          <LiveFlightTrack flight={flight} />
          <button className="signal-lz" onClick={() => onNavigate('atlas')} style={{ border: 0, background: 'none', cursor: 'pointer' }}><span className="signal-lz-mark"><Icon name="crosshair" size={25} /></span><span className="signal-lz-label">LANDING ZONE · {flight.zone.toUpperCase()} · 8.6 km</span></button>
          <div style={{ position: 'absolute', zIndex: 2, left: 14, top: 14 }}><Badge tone="neutral">Terrain cached · 09:08 UTC</Badge></div>
        </div>
        <div className="signal-side">
          <Metric label="Airspeed" value="214" unit="km/h" /><Metric label="Altitude" value="1 480" unit="m AMSL" /><Metric label="Vertical speed" value="−4.6" unit="m/s" /><Metric label="Glide" value="12.4" unit="L/D" />
          <div><span className="signal-title">Stream validity</span><div style={{ display: 'grid', gap: 8, marginTop: 10 }}><StatusDot state="ready" label="GNSS · valid" /><StatusDot state="ready" label="IMU · valid" /><StatusDot state="caution" label="Pitot · monitor" /></div></div>
        </div>
      </div>
      <div className="signal-events">
        <div className="signal-panel"><div className="signal-panel-head"><span className="signal-title">Event log</span><Badge tone="live">Live</Badge></div><div style={{ padding: '0 13px' }}>{events.slice(-4).map((e, i) => <Event key={i} {...e} />)}</div></div>
        <div className="signal-panel"><div className="signal-panel-head"><span className="signal-title">Operational context</span></div><div style={{ padding: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Mini label="Landing zone" value={flight.zone} /><Mini label="Aircraft" value={flight.aircraft} /><Mini label="Radio latency" value="84 ms" /><Mini label="Cloud sync" value={cloudLive ? 'Up to date' : '18 s behind'} /></div></div>
      </div>
    </div>;
  }

  function LiveFlightTrack({ flight }) {
    const [step, setStep] = React.useState(0);
    React.useEffect(() => { const timer = window.setInterval(() => setStep((s) => (s + 1) % 5), 900); return () => window.clearInterval(timer); }, []);
    const x = 43.5 + step * .35;
    const y = 53 - step * .16;
    const heading = 34 + Math.round(step / 2);
    return <>
      <FlightPathCanvas progress={step} />
      <div className="signal-vehicle" style={{ left: `${x}%`, top: `${y}%` }}>
        <span className="signal-heading-line" style={{ transform: `rotate(${heading}deg)` }} />
        <span className="signal-vehicle-icon" style={{ transform: `rotate(${heading}deg)` }}><Icon name="plane" size={23} strokeWidth={1.8} /></span>
        <span className="signal-vehicle-label"><strong>{flight.id} · LIVE</strong><br />1 480 m · 214 km/h · {String(heading).padStart(3, '0')}°</span>
      </div>
    </>;
  }

  function FlightPathCanvas({ progress }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const c=ref.current,ctx=c.getContext('2d'),d=window.devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=w*d;c.height=h*d;ctx.scale(d,d);ctx.clearRect(0,0,w,h);
      const points=[[.08,.28],[.16,.36],[.24,.44],[.31,.49],[.37,.51],[.435+progress*.0035,.53-progress*.0016]];
      const path=()=>{ctx.beginPath();points.forEach(([px,py],i)=>{const x=px*w,y=py*h;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});};
      ctx.strokeStyle='rgba(220,232,229,.58)';ctx.lineWidth=3;ctx.setLineDash([10,8]);path();ctx.stroke();
      ctx.strokeStyle='#8cff4d';ctx.lineWidth=3;ctx.setLineDash([7,6]);ctx.beginPath();points.slice(2).forEach(([px,py],i)=>{const x=px*w,y=py*h;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.stroke();ctx.setLineDash([]);
      const last=points[points.length-1],lx=last[0]*w,ly=last[1]*h;ctx.strokeStyle='rgba(140,255,77,.75)';ctx.lineWidth=1;ctx.setLineDash([4,6]);ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(lx+95,ly-70);ctx.stroke();ctx.setLineDash([]);
    },[progress]);
    return <canvas ref={ref} className="signal-track" aria-label="Live flight path and heading" />;
  }

  function InstrumentsView({ events }) {
    return <div className="signal-instruments"><div className="signal-panel"><div className="signal-panel-head"><span className="signal-title">Flight instruments · ground reconstruction</span><Badge tone="live">Live</Badge></div><AttitudeCanvas /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', borderTop: '1px solid var(--ex-carbon-700)' }}>{[['GNSS','Valid'],['IMU','Valid'],['Pitot','Monitor'],['SD card','Recording'],['Radio','Linked'],['Cloud','Live']].map(([k,v])=><div key={k} style={{ padding: '10px 12px', borderRight: '1px solid var(--ex-carbon-700)' }}><span className="signal-k">{k}</span><span className="signal-v" style={{ fontSize: 11, color: v==='Monitor'?'var(--ex-amber-500)':'var(--ex-field-500)' }}>{v}</span></div>)}</div></div><div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><div className="signal-panel" style={{ padding: 14 }}><span className="signal-title">Primary values</span><div style={{ display: 'grid', gap: 13, marginTop: 14 }}><Metric label="Heading" value="036" unit="deg" /><Metric label="Airspeed" value="214" unit="km/h" /><Metric label="Altitude" value="1 480" unit="m" /><Metric label="Glide" value="12.4" unit="L/D" /></div></div><div className="signal-panel"><div className="signal-panel-head"><span className="signal-title">Recent events</span></div><div style={{ padding: '0 12px' }}>{events.slice(-3).map((e,i)=><Event key={i} {...e} />)}</div></div></div></div>;
  }

  function AttitudeCanvas() {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const c = ref.current, ctx = c.getContext('2d'), d = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; c.width = w*d; c.height = h*d; ctx.scale(d,d);
      ctx.fillStyle='#0a1113'; ctx.fillRect(0,0,w,h); const cx=w/2, cy=h/2+8, r=Math.min(w,h)*.36;
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,0); ctx.lineTo(cx+r,cy+26); ctx.lineTo(cx-r,cy+26); ctx.closePath(); ctx.clip(); ctx.fillStyle='#254a73'; ctx.fillRect(cx-r,cy-r,r*2,r); ctx.fillStyle='#10181a'; ctx.fillRect(cx-r,cy,r*2,r); ctx.strokeStyle='#d6e4e1'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx-r,cy); ctx.lineTo(cx+r,cy); ctx.stroke(); ctx.restore();
      ctx.strokeStyle='#8cff4d'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,0); ctx.stroke();
      ctx.strokeStyle='#f2a23a'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(cx-80,cy-7); ctx.lineTo(cx-24,cy-7); ctx.lineTo(cx,cy+6); ctx.lineTo(cx+24,cy-7); ctx.lineTo(cx+80,cy-7); ctx.stroke();
      ctx.fillStyle='#8cff4d'; ctx.font='600 28px ui-monospace'; ctx.textAlign='center'; ctx.fillText('036°',cx,44); ctx.fillStyle='#71817e'; ctx.font='600 11px ui-monospace'; ctx.fillText('HEADING',cx,62); ctx.fillStyle='#f5f8f6'; ctx.font='500 13px ui-monospace'; ctx.fillText('LANDING ZONE · 8.6 km',cx,h-34);
      const tape=(x,label,value,steps,unit,side)=>{ctx.textAlign=side==='left'?'left':'right';ctx.fillStyle='#71817e';ctx.font='600 10px ui-monospace';ctx.fillText(label,x,78);ctx.fillText(unit,x,94);ctx.strokeStyle='#71817e';ctx.lineWidth=1;for(let i=-2;i<=2;i++){const y=cy+i*42;ctx.beginPath();ctx.moveTo(x+(side==='left'?48:-48),y);ctx.lineTo(x+(side==='left'?72:-72),y);ctx.stroke();ctx.fillStyle=i===0?'#8cff4d':'#dce8e5';ctx.font=i===0?'600 18px ui-monospace':'500 12px ui-monospace';ctx.fillText(String(value+i*steps),x,y+5);}ctx.strokeStyle='#8cff4d';ctx.strokeRect(x+(side==='left'?36:-102),cy-18,66,36);};
      tape(38,'AIRSPEED',214,10,'km/h','left'); tape(w-185,'V/S',-5,5,'m/s','right'); tape(w-32,'ALTITUDE',1480,100,'m','right');
      ctx.strokeStyle='#243133'; ctx.lineWidth=1; for(let y=95;y<h-70;y+=36){ctx.beginPath();ctx.moveTo(40,y);ctx.lineTo(w-40,y);ctx.stroke();}
    }, []);
    return <canvas ref={ref} className="signal-canvas" aria-label="Ground reconstructed attitude instrument" />;
  }

  function ChartsView({ cloudLive, onHangar }) {
    return <div className="signal-charts"><div className="signal-chart-panel"><div className="signal-panel-head"><span className="signal-title">Aligned telemetry · last 10 minutes</span><Badge tone={cloudLive ? 'ready' : 'caution'}>{cloudLive ? 'Healthy' : 'Local capture'}</Badge></div><ChartsCanvas cloudLive={cloudLive} /></div><aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><div className="signal-chart-panel signal-health"><span className="signal-title">Current state</span><h3>{cloudLive ? 'Streams healthy' : 'Cloud reconnecting'}</h3>{[['GNSS','Valid'],['IMU','Valid'],['Pitot','Monitor'],['Radio','Nominal'],['Local recorder','Recording'],['Cloud',cloudLive?'Live':'18 s behind']].map(([a,b])=><div key={a} className="signal-health-row"><span>{a}</span><span style={{ color: b==='Monitor'||b.includes('behind')?'var(--ex-amber-500)':'var(--ex-field-500)' }}>{b}</span></div>)}<div style={{ marginTop: 14 }}><Button size="sm" variant="secondary" onClick={onHangar}>Open pitot in Hangar</Button></div></div><div className="signal-chart-panel signal-health"><span className="signal-title">Data authority</span><p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ex-graphite-400)', lineHeight: 1.5 }}>The local FDR recording remains authoritative. Signal shows a reduced live stream and the cloud receives a resumable copy.</p></div></aside></div>;
  }

  function ChartsCanvas({ cloudLive, compact=false }) {
    const ref = React.useRef(null);
    React.useEffect(() => { const c=ref.current,ctx=c.getContext('2d'),d=window.devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=w*d;c.height=h*d;ctx.scale(d,d);ctx.fillStyle='#0a1113';ctx.fillRect(0,0,w,h);
      if(compact){const left=112,right=w-14,top=25,row=Math.max(33,(h-32)/4);ctx.textAlign='left';[['AIRSPEED','214'],['ALTITUDE','1 480'],['VERTICAL SPEED','−4.6'],['DATA VALIDITY','Valid']].forEach(([lab,value],i)=>{const y=top+i*row;ctx.fillStyle='#97a1a0';ctx.font='600 8px ui-monospace';ctx.fillText(lab,12,y);ctx.fillStyle=i===3?'#65bf6b':'#dce8e5';ctx.font='600 13px ui-monospace';ctx.fillText(value,12,y+17);ctx.strokeStyle=i===3?'#65bf6b':'#2fd6c6';ctx.lineWidth=2;ctx.beginPath();for(let x=left;x<=right;x+=6){const t=(x-left)/Math.max(1,right-left),yy=y+7+Math.sin(t*16+i)*2+(i===3&&!cloudLive&&t>.72?8:0);x===left?ctx.moveTo(x,yy):ctx.lineTo(x,yy);}ctx.stroke();});ctx.strokeStyle='#2fd6c6';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left+(right-left)*.68,10);ctx.lineTo(left+(right-left)*.68,h-10);ctx.stroke();return;}
      const left=154,right=w-24,top=38,row=61;ctx.font='600 10px ui-monospace';ctx.textAlign='left';const rows=[['AIRSPEED','km/h','214'],['ALTITUDE','m','1 480'],['VERTICAL SPEED','m/s','−4.6'],['GLIDE RATIO','L/D','12.4'],['RADIO QUALITY','RSSI dBm','−78'],['DATA VALIDITY','','Valid']];rows.forEach(([lab,unit,value],i)=>{const y=top+i*row;ctx.fillStyle='#97a1a0';ctx.fillText(lab,14,y);ctx.font='500 9px ui-monospace';ctx.fillText(unit,14,y+14);ctx.fillStyle=i===5?'#65bf6b':'#dce8e5';ctx.font='600 16px ui-monospace';ctx.fillText(value,14,y+37);ctx.font='600 10px ui-monospace';ctx.strokeStyle='#243133';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,y+22);ctx.lineTo(right,y+22);ctx.stroke();ctx.strokeStyle=i===4?'#2ea8ff':i===5?'#65bf6b':'#2fd6c6';ctx.lineWidth=2;ctx.beginPath();for(let x=left;x<=right;x+=8){let t=(x-left)/(right-left),yy=y+12+Math.sin(t*18+i)*2;if(i===4&&t>.42&&t<.52)yy+=28;if(i===5&&!cloudLive&&t>.72)yy+=12;x===left?ctx.moveTo(x,yy):ctx.lineTo(x,yy);}ctx.stroke();});ctx.strokeStyle='#2fd6c6';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left+(right-left)*.68,18);ctx.lineTo(left+(right-left)*.68,h-24);ctx.stroke();ctx.fillStyle='#dce8e5';ctx.font='600 11px ui-monospace';ctx.fillText('T0+06:32',left+(right-left)*.68+8,20);ctx.fillStyle='#f2a23a';ctx.fillText('PITOT FLAG · RESOLVED',left+(right-left)*.31,top+2*row+45);if(!cloudLive){ctx.fillText('CLOUD 18 s BEHIND · LOCAL CAPTURE CONTINUES',left+(right-left)*.62,top+5*row+47);}},[cloudLive,compact]);
    return <canvas ref={ref} className="signal-charts-canvas" aria-label="Aligned live telemetry charts" />;
  }

  function Metric({ label, value, unit }) { return <div className="signal-metric"><span><span className="signal-k">{label}</span><small>{unit}</small></span><strong>{value}</strong></div>; }
  function Event({ t, label, state }) { return <div className="signal-event-row"><time>{t}</time><i className={`signal-dot ${state==='live'?'live':''} ${state==='caution'?'caution':''}`} /><span>{label}</span></div>; }
  function Mini({ label, value }) { return <div><span className="signal-k">{label}</span><span className="signal-v">{value}</span></div>; }
  window.OSSignal = { Signal };
})();
