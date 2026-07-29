/* Sillage Hangar — fleet, serialized inventory, assemblies, functions, builds, and tests. */
(function () {
  const { Icon } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const { Badge, Button, StatusDot } = DS;

  const SECTIONS = [
    { id: 'fleet', label: 'Fleet' },
    { id: 'assemblies', label: 'Assemblies' },
    { id: 'parts', label: 'Parts' },
    { id: 'functions', label: 'Functions' },
    { id: 'qualification', label: 'Qualification' },
  ];

  const FLEET = [
    {
      id: 'F-GOCC', type: 'Pilatus PC-6/B2-H4', role: 'Flight-test aircraft', state: 'caution', label: '1 item to review', summary: '1 assembly · 5 parts',
      cycles: '18 test flights', updated: 'Configuration since 24 Jul 2026',
      installations: [
        { kind: 'Assembly', id: 'FDR-0012', name: 'Flight data recorder', meta: 'Installed in F-GOCC', state: 'caution', label: 'Conditional', children: [
          { kind: 'Part', id: 'REC-0007', name: 'XIAO ESP32S3 recorder', meta: 'SN XIAO-7431', state: 'ready', label: 'Installed' },
          { kind: 'Part', id: 'GPS-0008', name: 'Holybro M9N GNSS', meta: 'SN M9N-2481', state: 'ready', label: 'Installed' },
          { kind: 'Part', id: 'IMU-0004', name: 'BNO085 IMU', meta: 'SN BNO-0917', state: 'ready', label: 'Installed' },
          { kind: 'Part', id: 'PIT-0006', name: 'Matek ASPD-AUAV', meta: 'SN ASPD-1142', state: 'caution', label: 'Review flag' },
          { kind: 'Part', id: 'RAD-0003', name: 'SiK 433 MHz air radio', meta: 'SN SIK-433-03', state: 'ready', label: 'Installed' },
        ] },
      ],
    },
    {
      id: 'WS-TEST-02', type: 'Wingsuit', role: 'Personal flight-test article', state: 'ready', label: 'Ready', summary: '1 installed device',
      cycles: '7 test flights', updated: 'Configuration since 26 Jul 2026',
      installations: [
        { kind: 'Equipment', id: 'FLY-0003', name: 'FlySight 2', meta: 'Installed in WS-TEST-02 · SN FS2-2184', state: 'ready', label: 'Installed', children: [] },
      ],
    },
    {
      id: 'EXO-001', type: 'Exowing prototype', role: 'Glider prototype', state: 'ready', label: 'Ready', summary: '2 assemblies · 9 parts',
      cycles: '4 test flights', updated: 'Configuration since 27 Jul 2026',
      installations: [
        { kind: 'Assembly', id: 'WING-0001', name: 'Wing structure and controls', meta: 'Installed in EXO-001', state: 'ready', label: 'Serviceable', children: [
          { kind: 'Subassembly', id: 'CTRL-0002', name: 'Control linkage', meta: '4 serialized parts', state: 'ready', label: 'Serviceable' },
          { kind: 'Part', id: 'STR-0009', name: 'Primary structure', meta: 'SN EXOW-STR-01', state: 'ready', label: 'Installed' },
        ] },
        { kind: 'Assembly', id: 'FDR-0014', name: 'Flight data recorder', meta: 'Installed in EXO-001', state: 'ready', label: 'Serviceable', children: [
          { kind: 'Part', id: 'GPS-0011', name: 'Holybro M9N GNSS', meta: 'SN M9N-2514', state: 'ready', label: 'Installed' },
          { kind: 'Part', id: 'IMU-0006', name: 'BNO085 IMU', meta: 'SN BNO-1044', state: 'ready', label: 'Installed' },
        ] },
      ],
    },
  ];

  const ASSEMBLIES = [
    { code: 'FDR-0012', name: 'Flight data recorder', parent: '—', installed: 'F-GOCC', parts: 5, state: 'caution', label: 'Conditional', note: 'Airborne FDR used for Pilatus validation flights.' },
    { code: 'FDR-0014', name: 'Flight data recorder', parent: '—', installed: 'EXO-001', parts: 5, state: 'ready', label: 'Serviceable', note: 'Exowing recorder configuration.' },
    { code: 'WING-0001', name: 'Wing structure and controls', parent: '—', installed: 'EXO-001', parts: 4, state: 'ready', label: 'Serviceable', note: 'Primary Exowing mechanical assembly.' },
    { code: 'CTRL-0002', name: 'Control linkage', parent: 'WING-0001', installed: 'EXO-001', parts: 4, state: 'ready', label: 'Serviceable', note: 'Nested subassembly for pitch and roll control.' },
    { code: 'FDR-0015', name: 'Flight data recorder', parent: '—', installed: 'Not installed', parts: 0, state: 'unknown', label: 'In preparation', note: 'Empty assembly reserved for the next recorder build.' },
  ];

  const PARTS = [
    { id: 'REC-0007', function: 'Recorder', manufacturer: 'Seeed Studio', model: 'XIAO ESP32S3', serial: 'XIAO-7431', assembly: 'FDR-0012', state: 'installed', label: 'Installed' },
    { id: 'GPS-0008', function: 'GNSS', manufacturer: 'Holybro', model: 'M9N', serial: 'M9N-2481', assembly: 'FDR-0012', state: 'installed', label: 'Installed' },
    { id: 'IMU-0004', function: 'IMU', manufacturer: 'CEVA', model: 'BNO085', serial: 'BNO-0917', assembly: 'FDR-0012', state: 'installed', label: 'Installed' },
    { id: 'PIT-0006', function: 'Air data', manufacturer: 'Matek', model: 'ASPD-AUAV', serial: 'ASPD-1142', assembly: 'FDR-0012', state: 'quarantined', label: 'Review flag' },
    { id: 'RAD-0003', function: 'Radio', manufacturer: 'Holybro', model: 'SiK 433 MHz', serial: 'SIK-433-03', assembly: 'FDR-0012', state: 'installed', label: 'Installed' },
    { id: 'FLY-0003', function: 'Flight computer', manufacturer: 'FlySight', model: 'FlySight 2', serial: 'FS2-2184', assembly: 'WS-TEST-02', state: 'installed', label: 'Installed' },
    { id: 'GPS-0012', function: 'GNSS', manufacturer: 'Holybro', model: 'M9N', serial: 'M9N-2527', assembly: '—', state: 'available', label: 'Available' },
  ];

  const FUNCTIONS = [
    { code: 'GNSS', name: 'Global navigation', description: 'Position, altitude, groundspeed, and GNSS time.', count: 3 },
    { code: 'IMU', name: 'Inertial measurement', description: 'Attitude, angular rates, and acceleration.', count: 2 },
    { code: 'AIR_DATA', name: 'Air data', description: 'Differential pressure and derived airspeed.', count: 2 },
    { code: 'RECORDER', name: 'Recorder', description: 'Authoritative acquisition and local storage.', count: 3 },
    { code: 'RADIO', name: 'Telemetry radio', description: 'Reduced live telemetry and link health.', count: 2 },
    { code: 'FLIGHT_COMPUTER', name: 'Flight computer', description: 'Standalone personal flight instrumentation.', count: 1 },
  ];

  const BUILDS = [
    { code: 'FDR-DEV-042', assembly: 'FDR-0012', previous: 'FDR-DEV-041', firmware: '8c41a27', state: 'caution', label: 'Tests in progress', locked: 'No' },
    { code: 'FDR-DEV-041', assembly: 'FDR-0012', previous: 'FDR-DEV-040', firmware: 'ab498ee', state: 'ready', label: 'Qualified', locked: 'Yes' },
    { code: 'FDR-EXO-009', assembly: 'FDR-0014', previous: 'FDR-EXO-008', firmware: '32f08bd', state: 'ready', label: 'Qualified', locked: 'Yes' },
  ];

  const TESTS = [
    { uuid: 'TR-92A7', build: 'FDR-DEV-042', target: 'PIT-0006', recipe: 'air-data-zero/v3', ran: '28 Jul · 14:32', state: 'caution', label: 'Blocked' },
    { uuid: 'TR-91F2', build: 'FDR-DEV-041', target: 'Whole build', recipe: 'bench-smoke/v5', ran: '27 Jul · 17:08', state: 'ready', label: 'Passed' },
    { uuid: 'TR-90C8', build: 'FDR-EXO-009', target: 'Whole build', recipe: 'flight-readiness/v2', ran: '27 Jul · 11:46', state: 'ready', label: 'Passed' },
  ];

  const CSS = `
    .hangar-root{padding:18px 20px 28px;max-width:1180px;margin:0 auto}
    .hangar-head{display:flex;align-items:flex-end;gap:16px;margin-bottom:12px}
    .hangar-tabs{display:flex;align-items:center;gap:4px;padding:4px;background:var(--surface-panel);border:1px solid var(--border-rule);border-radius:8px;margin-bottom:20px;width:max-content}
    .hangar-tab{border:0;border-radius:5px;background:transparent;color:var(--text-muted);padding:8px 13px;font:600 11px/1 var(--font-mono);letter-spacing:.05em;text-transform:uppercase;cursor:pointer}
    .hangar-tab[data-active=true]{background:var(--surface-card);color:var(--text-strong);box-shadow:var(--shadow-sm)}
    .hangar-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
    .hangar-summary-card{background:var(--surface-card);border:1px solid var(--border-rule);border-radius:8px;padding:11px 13px;box-shadow:var(--shadow-sm)}
    .hangar-summary-card strong{display:block;margin-top:5px;font:700 18px/1 var(--font-data);color:var(--text-strong)}
    .hangar-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:14px}
    .hangar-layout--assemblies{grid-template-columns:minmax(520px,.95fr) minmax(380px,1.05fr)}
    .hangar-panel{background:var(--surface-card);border:1px solid var(--border-rule);border-radius:8px;box-shadow:var(--shadow-sm);overflow:hidden}
    .hangar-panel-head{display:flex;align-items:center;gap:12px;padding:13px 14px;border-bottom:1px solid var(--border-rule)}
    .hangar-section-head{display:flex;align-items:flex-end;gap:16px;margin-bottom:12px}.hangar-section-head>div:first-child{flex:1}.hangar-section-head h2{margin:0;font-size:20px;line-height:1.15;color:var(--text-strong)}
    .hangar-fleet-item{width:100%;padding:13px 14px;border:0;border-bottom:1px solid var(--border-rule);background:transparent;text-align:left;cursor:pointer}
    .hangar-fleet-item[data-active=true]{background:var(--surface-hover);box-shadow:inset 3px 0 0 var(--ex-aqua-500)}
    .hangar-fleet-item:hover,.hangar-table tbody tr:hover{background:var(--surface-hover)}
    .hangar-fleet-name{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .hangar-fleet-name strong{font:700 15px/1.2 var(--font-data);color:var(--text-strong)}
    .hangar-fleet-meta{margin-top:6px;font-size:12px;color:var(--text-muted)}
    .hangar-fleet-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;font:500 10px/1.2 var(--font-mono);color:var(--text-muted)}
    .hangar-asset-head{padding:14px 16px;border-bottom:1px solid var(--border-rule);display:flex;align-items:flex-start;gap:12px}
    .hangar-asset-head h2{margin:4px 0 3px;font-size:20px;color:var(--text-strong)}
    .hangar-asset-meta{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--border-rule)}
    .hangar-asset-meta>div{padding:11px 14px;border-right:1px solid var(--border-rule)}
    .hangar-config-head{padding:12px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border-rule);background:var(--surface-panel)}
    .hangar-tree-row{display:grid;grid-template-columns:minmax(0,1fr) 150px 116px;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border-rule)}
    .hangar-tree-row[data-level="1"]{padding-left:38px;background:rgba(239,244,242,.45)}
    .hangar-tree-primary{display:flex;align-items:center;gap:9px;min-width:0}
    .hangar-tree-icon{width:28px;height:28px;display:grid;place-items:center;border-radius:6px;background:var(--surface-panel);color:var(--text-muted);flex:none}
    .hangar-tree-copy{min-width:0}.hangar-tree-copy strong{display:block;font:600 13px/1.25 var(--font-data);color:var(--text-strong)}
    .hangar-tree-copy span{display:block;margin-top:2px;font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hangar-kind{font:600 9px/1 var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
    .hangar-detail-foot{display:grid;grid-template-columns:1fr 1fr;gap:0}.hangar-detail-foot>div{padding:13px 14px}.hangar-detail-foot>div+div{border-left:1px solid var(--border-rule)}
    .hangar-table{width:100%;border-collapse:collapse}.hangar-table th{text-align:left;padding:12px 13px 9px;font:600 9px/1 var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);white-space:nowrap}.hangar-table td{padding:11px 13px;border-top:1px solid var(--border-rule);font-size:12px;color:var(--text-body);vertical-align:middle}.hangar-table tbody tr{cursor:pointer}
    .hangar-code{font:700 12px/1.2 var(--font-data);color:var(--text-strong)}
    .hangar-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:12px}.hangar-search,.hangar-select{height:38px;border:1px solid var(--border-rule);border-radius:6px;background:var(--surface-card);color:var(--text-body);padding:0 11px;font:500 13px var(--font-sans);outline:none}.hangar-search{width:250px}.hangar-search:focus,.hangar-select:focus,.hangar-field input:focus,.hangar-field select:focus,.hangar-field textarea:focus{border-color:var(--focus-ring);box-shadow:0 0 0 2px rgba(47,214,198,.15)}
    .hangar-function-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.hangar-function-card{padding:14px;background:var(--surface-card);border:1px solid var(--border-rule);border-radius:8px;box-shadow:var(--shadow-sm)}.hangar-function-card h3{margin:5px 0 5px;font-size:15px;color:var(--text-strong)}.hangar-function-card p{margin:0;min-height:38px;font-size:12px;line-height:1.45;color:var(--text-muted)}.hangar-function-foot{display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-rule)}
    .hangar-qualification{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}.hangar-qual-note{padding:13px 14px;border-top:1px solid var(--border-rule);background:var(--surface-panel);font-size:12px;line-height:1.5;color:var(--text-muted)}
    .hangar-backdrop{position:fixed;z-index:60;inset:0;background:rgba(7,11,13,.46);display:flex;justify-content:flex-end}
    .hangar-drawer{width:min(470px,calc(100vw - 40px));height:100%;background:var(--surface-card);box-shadow:-18px 0 48px rgba(7,11,13,.22);display:flex;flex-direction:column}
    .hangar-drawer-head{display:flex;align-items:flex-start;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border-rule)}.hangar-drawer-head h2{margin:4px 0 3px;font-size:21px;color:var(--text-strong)}
    .hangar-drawer-body{padding:18px 20px;overflow:auto;display:grid;gap:15px}.hangar-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.hangar-field{display:grid;gap:6px}.hangar-field.full{grid-column:1/-1}.hangar-field label{font:600 10px/1 var(--font-mono);letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted)}.hangar-field input,.hangar-field select,.hangar-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--border-rule);border-radius:6px;background:var(--surface-card);color:var(--text-body);padding:10px 11px;font:500 13px var(--font-sans);outline:none}.hangar-field textarea{min-height:78px;resize:vertical}
    .hangar-help{padding:11px 12px;border-radius:6px;background:var(--surface-panel);font-size:12px;line-height:1.5;color:var(--text-muted)}
    .hangar-drawer-foot{margin-top:auto;display:flex;justify-content:flex-end;gap:9px;padding:14px 20px;border-top:1px solid var(--border-rule)}
    .hangar-success{flex:1;display:grid;place-items:center;padding:32px}.hangar-success>div{text-align:center;max-width:310px}.hangar-success-icon{width:48px;height:48px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;background:var(--ex-state-ready-bg);color:var(--ex-field-500)}.hangar-success h2{margin:0 0 7px;color:var(--text-strong)}.hangar-success p{margin:0 0 18px;color:var(--text-muted);line-height:1.5}
    @media(max-width:900px){.hangar-layout,.hangar-qualification{grid-template-columns:1fr}.hangar-summary{grid-template-columns:1fr 1fr}.hangar-function-grid{grid-template-columns:1fr 1fr}.hangar-tree-row{grid-template-columns:minmax(0,1fr) 105px}.hangar-tree-row>.hangar-kind{display:none}.hangar-tabs{max-width:100%;overflow:auto}}
  `;
  if (!document.getElementById('hangar-screen-css')) { const s=document.createElement('style');s.id='hangar-screen-css';s.textContent=CSS;document.head.appendChild(s); }

  function Hangar({ onOpenSignal }) {
    const [section, setSection] = React.useState('fleet');
    const [drawer, setDrawer] = React.useState(null);
    const [notice, setNotice] = React.useState('');
    const openDrawer = (type) => { setNotice(''); setDrawer(type); };
    const closeDrawer = () => setDrawer(null);
    const created = (message) => { setNotice(message); setDrawer(null); };
    return <div className="hangar-root">
      <div className="hangar-head">
        <div style={{ flex: 1 }}><span style={EYEBROW}>Sillage</span><h1 style={H1}>Hangar</h1><p style={LEAD}>Aircraft, installed configurations, serialized inventory, and qualification evidence.</p></div>
        {notice && <Badge tone="ready">{notice}</Badge>}
      </div>
      <nav className="hangar-tabs" aria-label="Hangar sections">{SECTIONS.map((item)=><button key={item.id} className="hangar-tab" data-active={section===item.id} onClick={()=>setSection(item.id)}>{item.label}</button>)}</nav>
      {section === 'fleet' && <FleetView onAdd={()=>openDrawer('aircraft')} onInstall={()=>openDrawer('installation')} onOpenSignal={onOpenSignal} />}
      {section === 'assemblies' && <AssembliesView onAdd={()=>openDrawer('assembly')} />}
      {section === 'parts' && <PartsView onAdd={()=>openDrawer('part')} />}
      {section === 'functions' && <FunctionsView onAdd={()=>openDrawer('function')} />}
      {section === 'qualification' && <QualificationView onBuild={()=>openDrawer('build')} onTest={()=>openDrawer('test')} />}
      {drawer && <CreateDrawer key={drawer} type={drawer} onClose={closeDrawer} onCreated={created} />}
    </div>;
  }

  function FleetView({ onAdd, onInstall, onOpenSignal }) {
    const [selected, setSelected] = React.useState(0);
    const aircraft = FLEET[selected];
    return <>
      <div className="hangar-section-head"><div><h2>Fleet</h2><p style={LEAD}>Aircraft are durable identities; installations record which equipment flew, and when.</p></div><Button variant="secondary" iconLeft={<Icon name="plus" size={18} />} onClick={onAdd}>Register aircraft</Button></div>
      <div className="hangar-summary"><Summary label="Aircraft" value="3 registered" /><Summary label="Installed configurations" value="4 active" /><Summary label="Attention" value="1 review item" caution /></div>
      <div className="hangar-layout">
        <aside className="hangar-panel"><div className="hangar-panel-head"><span style={EYEBROW}>Fleet aircraft</span><div style={{flex:1}}/><Badge tone="neutral">3</Badge></div>{FLEET.map((item,index)=><button key={item.id} className="hangar-fleet-item" data-active={selected===index} onClick={()=>setSelected(index)}><div className="hangar-fleet-name"><strong>{item.id}</strong><Icon name="chevron-right" size={16} style={{color:'var(--text-muted)'}}/></div><div className="hangar-fleet-meta">{item.type}<br/>{item.role}</div><div className="hangar-fleet-foot"><StatusDot state={item.state} label={item.label}/><span>{item.summary}</span></div></button>)}</aside>
        <section className="hangar-panel">
          <div className="hangar-asset-head"><div className="hangar-tree-icon" style={{width:36,height:36,color:'var(--ex-aqua-500)'}}><Icon name="plane" size={20}/></div><div style={{flex:1}}><span style={EYEBROW}>Aircraft</span><h2>{aircraft.id} · {aircraft.type}</h2><p style={LEAD}>{aircraft.role}</p></div><Button size="sm" variant="secondary" onClick={onInstall}>Change configuration</Button><Badge tone={aircraft.state==='caution'?'caution':'ready'}>{aircraft.state==='caution'?'Conditional':'Ready'}</Badge></div>
          <div className="hangar-asset-meta"><Mini label="Current configuration" value={aircraft.updated}/><Mini label="Usage" value={aircraft.cycles}/><Mini label="Installed content" value={aircraft.summary}/></div>
          <div className="hangar-config-head"><span style={EYEBROW}>Installed configuration</span><span style={{...EYEBROW,letterSpacing:'.04em'}}>Installation → assembly / equipment → part</span></div>
          <div>{aircraft.installations.map((item)=><Configuration key={item.id} item={item}/>)}</div>
          <div className="hangar-detail-foot"><div><span style={EYEBROW}>Configuration history</span><p style={{...LEAD,lineHeight:1.45}}>Every installation and removal is dated, so an FDR assembly can move between aircraft without losing traceability.</p></div><div><span style={EYEBROW}>Flight handoff</span><p style={{...LEAD,lineHeight:1.45}}>{aircraft.id==='F-GOCC'?'PIT-0006 is linked to the last live telemetry flag.':'The current physical configuration is ready to be attached to the next flight record.'}</p>{aircraft.id==='F-GOCC'&&<div style={{marginTop:9}}><Button size="sm" variant="secondary" iconLeft={<Icon name="signal" size={15}/>} onClick={onOpenSignal}>Inspect in Signal</Button></div>}</div></div>
        </section>
      </div>
    </>;
  }

  function AssembliesView({ onAdd }) {
    const [selected, setSelected] = React.useState(0); const item = ASSEMBLIES[selected];
    return <><div className="hangar-section-head"><div><h2>Assemblies</h2><p style={LEAD}>Reusable physical configurations contain Parts and may include nested Assemblies.</p></div><Button iconLeft={<Icon name="plus" size={17}/>} onClick={onAdd}>New assembly</Button></div><div className="hangar-layout hangar-layout--assemblies"><section className="hangar-panel"><table className="hangar-table"><thead><tr><th>Assembly</th><th>Installed in</th><th>Parts</th><th>State</th></tr></thead><tbody>{ASSEMBLIES.map((a,i)=><tr key={a.code} onClick={()=>setSelected(i)} style={selected===i?{background:'var(--surface-hover)'}:null}><td><strong className="hangar-code">{a.code}</strong><br/><span style={{color:'var(--text-muted)'}}>{a.name}</span></td><td>{a.installed}</td><td>{a.parts}</td><td><StatusDot state={a.state} label={a.label}/></td></tr>)}</tbody></table></section><aside className="hangar-panel"><div className="hangar-panel-head"><span style={EYEBROW}>Assembly details</span></div><div style={{padding:15}}><span style={EYEBROW}>{item.parent==='—'?'Root assembly':`Child of ${item.parent}`}</span><h2 style={{margin:'6px 0 4px',fontSize:19}}>{item.code}</h2><p style={{...LEAD,lineHeight:1.5}}>{item.note}</p><div style={{display:'grid',gap:11,marginTop:16}}><Mini label="Name" value={item.name}/><Mini label="Installed in" value={item.installed}/><Mini label="Direct parts" value={String(item.parts)}/><Mini label="Parent" value={item.parent}/></div></div><div className="hangar-qual-note">Parts are installed in an assembly. Aircraft installation is tracked separately, so the complete assembly can be moved without rewriting its contents.</div></aside></div></>;
  }

  function PartsView({ onAdd }) {
    const [query,setQuery]=React.useState(''); const [state,setState]=React.useState('all');
    const rows=PARTS.filter((p)=>(state==='all'||p.state===state)&&`${p.id} ${p.function} ${p.manufacturer} ${p.model} ${p.serial}`.toLowerCase().includes(query.toLowerCase()));
    return <><div className="hangar-section-head"><div><h2>Parts</h2><p style={LEAD}>Serialized physical inventory with installation state and functional role.</p></div><Button iconLeft={<Icon name="plus" size={17}/>} onClick={onAdd}>Register part</Button></div><div className="hangar-toolbar"><input className="hangar-search" aria-label="Search parts" placeholder="Search part, serial, function…" value={query} onChange={(e)=>setQuery(e.target.value)}/><select className="hangar-select" aria-label="Filter part state" value={state} onChange={(e)=>setState(e.target.value)}><option value="all">All states</option><option value="available">Available</option><option value="installed">Installed</option><option value="quarantined">Quarantined</option><option value="retired">Retired</option></select><div style={{flex:1}}/><Badge tone="neutral">{rows.length} parts</Badge></div><section className="hangar-panel"><table className="hangar-table"><thead><tr><th>Part</th><th>Function</th><th>Manufacturer / model</th><th>Serial</th><th>Assembly</th><th>State</th></tr></thead><tbody>{rows.map((p)=><tr key={p.id}><td><strong className="hangar-code">{p.id}</strong></td><td>{p.function}</td><td>{p.manufacturer} · {p.model}</td><td style={{fontFamily:'var(--font-data)'}}>{p.serial}</td><td>{p.assembly}</td><td><StatusDot state={toneForPart(p.state)} label={p.label}/></td></tr>)}</tbody></table></section></>;
  }

  function FunctionsView({ onAdd }) {
    return <><div className="hangar-section-head"><div><h2>Functions</h2><p style={LEAD}>Controlled roles classify Parts without adding a level to the physical hierarchy.</p></div><Badge tone="neutral">Admin</Badge><Button iconLeft={<Icon name="plus" size={17}/>} onClick={onAdd}>New function</Button></div><div className="hangar-function-grid">{FUNCTIONS.map((f)=><article key={f.code} className="hangar-function-card"><span className="hangar-code">{f.code}</span><h3>{f.name}</h3><p>{f.description}</p><div className="hangar-function-foot"><span style={EYEBROW}>Assigned inventory</span><strong style={{fontFamily:'var(--font-data)'}}>{f.count} parts</strong></div></article>)}</div></>;
  }

  function QualificationView({ onBuild, onTest }) {
    return <><div className="hangar-section-head"><div><h2>Qualification</h2><p style={LEAD}>Frozen Builds and Test Runs provide evidence for a specific configuration.</p></div><Button variant="secondary" iconLeft={<Icon name="plus" size={17}/>} onClick={onTest}>Record test run</Button><Button iconLeft={<Icon name="plus" size={17}/>} onClick={onBuild}>New build</Button></div><div className="hangar-qualification"><section className="hangar-panel"><div className="hangar-panel-head"><span style={EYEBROW}>Builds</span><div style={{flex:1}}/><Badge tone="neutral">{BUILDS.length}</Badge></div><table className="hangar-table"><thead><tr><th>Build</th><th>Assembly</th><th>Firmware</th><th>Locked</th><th>State</th></tr></thead><tbody>{BUILDS.map((b)=><tr key={b.code}><td><strong className="hangar-code">{b.code}</strong><br/><span style={{color:'var(--text-muted)'}}>after {b.previous}</span></td><td>{b.assembly}</td><td style={{fontFamily:'var(--font-data)'}}>{b.firmware}</td><td>{b.locked}</td><td><StatusDot state={b.state} label={b.label}/></td></tr>)}</tbody></table><div className="hangar-qual-note">The first recorded Test Run locks its Build. Changes require cloning the Build as a new iteration.</div></section><section className="hangar-panel"><div className="hangar-panel-head"><span style={EYEBROW}>Recent test runs</span></div>{TESTS.map((t)=><div key={t.uuid} style={{padding:'12px 14px',borderBottom:'1px solid var(--border-rule)'}}><div style={{display:'flex',alignItems:'center',gap:8}}><strong className="hangar-code" style={{flex:1}}>{t.uuid} · {t.build}</strong><StatusDot state={t.state} label={t.label}/></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}><Mini label="Target" value={t.target}/><Mini label="Recipe" value={t.recipe}/><Mini label="Ran at" value={t.ran}/></div></div>)}</section></div></>;
  }

  const DRAWERS = {
    aircraft: { eyebrow:'Fleet', title:'Register aircraft', description:'Create the durable identity that flights and installations refer to.', success:'Aircraft registered', message:'The aircraft is ready to receive assemblies or standalone equipment.' },
    installation: { eyebrow:'Fleet configuration', title:'Install equipment', description:'Attach an assembly or standalone device to an aircraft with an effective date.', success:'Configuration updated', message:'The dated installation now defines the aircraft configuration for future flights.' },
    assembly: { eyebrow:'Assemblies', title:'Create assembly', description:'Create an empty physical container, optionally nested below another assembly.', success:'Assembly created', message:'It is available for parts, child assemblies, and aircraft installation.' },
    part: { eyebrow:'Serialized inventory', title:'Register part', description:'Register one physical item and classify it with a Function.', success:'Part registered', message:'The part is available and can now be installed in an assembly.' },
    function: { eyebrow:'Controlled catalog · Admin', title:'Create function', description:'Add a reusable functional role for classifying parts.', success:'Function created', message:'The new Function is now available when registering or editing parts.' },
    build: { eyebrow:'Qualification', title:'Create build', description:'Freeze an assembly snapshot together with its firmware and source revision.', success:'Build created', message:'The immutable configuration snapshot is ready for its first Test Run.' },
    test: { eyebrow:'Qualification', title:'Record test run', description:'Attach structured test evidence to a Build or one Part contained in it.', success:'Test run recorded', message:'The Build is now locked and the result is available for review.' },
  };

  function CreateDrawer({ type, onClose, onCreated }) {
    const config=DRAWERS[type]; const [saved,setSaved]=React.useState(false);
    if(saved) return <div className="hangar-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><aside className="hangar-drawer" role="dialog" aria-modal="true" aria-label={config.success}><div className="hangar-success"><div><span className="hangar-success-icon"><Icon name="check" size={24}/></span><h2>{config.success}</h2><p>{config.message}</p><Button onClick={()=>onCreated(config.success)}>Done</Button></div></div></aside></div>;
    return <div className="hangar-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><aside className="hangar-drawer" role="dialog" aria-modal="true" aria-label={config.title}><div className="hangar-drawer-head"><div style={{flex:1}}><span style={EYEBROW}>{config.eyebrow}</span><h2>{config.title}</h2><p style={LEAD}>{config.description}</p></div><button aria-label="Close" onClick={onClose} style={ICON_BUTTON}><Icon name="x" size={18}/></button></div><div className="hangar-drawer-body"><DrawerFields type={type}/></div><div className="hangar-drawer-foot"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={()=>setSaved(true)}>{type==='test'?'Record test run':'Save'}</Button></div></aside></div>;
  }

  function DrawerFields({ type }) {
    if(type==='aircraft') return <div className="hangar-form-grid"><Field label="Aircraft ID" value="F-HNEW"/><Field label="Type" value="Pilatus PC-6"/><Field label="Role" value="Flight-test aircraft"/><SelectField label="Initial state" options={['Ready','Unavailable','In maintenance']}/><Field full label="Notes" textarea value="Aircraft registered for FDR validation flights."/><Help>Register the aircraft first. Assemblies and equipment are attached afterward through dated installations.</Help></div>;
    if(type==='installation') return <div className="hangar-form-grid"><SelectField label="Aircraft" options={['F-GOCC','WS-TEST-02','EXO-001']}/><SelectField label="Equipment" options={['FDR-0015 · Flight data recorder','FDR-0012 · Flight data recorder','FLY-0003 · FlySight 2']}/><Field label="Effective from" value="28 Jul 2026 · 16:00"/><Field label="Mounting position" value="Cabin · aft bulkhead"/><Field full label="Installation note" textarea value="Installed for the next test campaign."/><Help>This action closes any conflicting active installation and preserves the previous configuration in history.</Help></div>;
    if(type==='assembly') return <div className="hangar-form-grid"><Field label="Assembly code" value="FDR-0015"/><Field label="Name" value="Flight data recorder"/><SelectField full label="Parent assembly" options={['None · root assembly','WING-0001 · Wing structure and controls','FDR-0012 · Flight data recorder']}/><Field full label="Notes" textarea value="Recorder assembly for the next hardware iteration."/><Help>An assembly starts empty. Add Parts or nested Assemblies after creation, then install the resulting configuration in an aircraft.</Help></div>;
    if(type==='part') return <div className="hangar-form-grid"><Field label="Internal number" value="PART-000013"/><SelectField label="Function" options={['GNSS · Global navigation','IMU · Inertial measurement','AIR_DATA · Air data','RECORDER · Recorder','RADIO · Telemetry radio']}/><Field label="Manufacturer" value="Holybro"/><Field label="Model" value="M9N"/><Field label="Serial number" value="M9N-2527"/><SelectField label="Initial state" options={['Available','Quarantined','Retired']}/><SelectField full label="Install in assembly · optional" options={['Leave available','FDR-0015 · Flight data recorder','FDR-0012 · Flight data recorder','FDR-0014 · Flight data recorder']}/><Field full label="Notes" textarea value="Bench checked on receipt."/><Help>Installed state is derived from the selected Assembly. Quarantined or retired Parts cannot be installed.</Help></div>;
    if(type==='function') return <div className="hangar-form-grid"><Field label="Code" value="POWER"/><Field label="Name" value="Power supply"/><Field full label="Description" textarea value="Power conversion, distribution, and source monitoring."/><Help>Functions are controlled reference data. They classify Parts but never contain them physically.</Help></div>;
    if(type==='build') return <div className="hangar-form-grid"><Field label="Build code" value="FDR-DEV-043"/><SelectField label="Assembly" options={['FDR-0012 · Flight data recorder','FDR-0014 · Flight data recorder','WING-0001 · Wing structure and controls']}/><SelectField label="Previous build" options={['FDR-DEV-042','FDR-DEV-041','None']}/><Field label="Source revision" value="8c41a27"/><Field label="Arduino Core" value="3.3.10"/><Field label="Firmware SHA-256" value="Pending upload"/><Field full label="Notes" textarea value="Updated radio scheduling and pitot filtering."/><Help>The current Assembly contents are copied into an immutable snapshot. Once testing begins, create a new Build for every change.</Help></div>;
    return <div className="hangar-form-grid"><SelectField label="Build" options={['FDR-DEV-042 · FDR-0012','FDR-DEV-041 · FDR-0012','FDR-EXO-009 · FDR-0014']}/><SelectField label="Target" options={['Whole build','PIT-0006 · Matek ASPD-AUAV','RAD-0003 · SiK 433 MHz']}/><Field label="Recipe ID" value="air-data-zero"/><Field label="Recipe version" value="3"/><Field label="Ran at" value="28 Jul 2026 · 16:15"/><SelectField label="Outcome" options={['Passed','Failed','Blocked']}/><Field full label="Notes" textarea value="Zero drift remains outside the acceptance band."/><Help>The first Test Run locks the Build. A Part target must exist in the stored Build snapshot.</Help></div>;
  }

  function Field({label,value,textarea,full}) { const [v,setV]=React.useState(value); return <div className={`hangar-field ${full?'full':''}`}><label>{label}</label>{textarea?<textarea value={v} onChange={(e)=>setV(e.target.value)}/>:<input value={v} onChange={(e)=>setV(e.target.value)}/>}</div>; }
  function SelectField({label,options,full}) { const [v,setV]=React.useState(options[0]); return <div className={`hangar-field ${full?'full':''}`}><label>{label}</label><select value={v} onChange={(e)=>setV(e.target.value)}>{options.map((o)=><option key={o}>{o}</option>)}</select></div>; }
  function Help({children}) { return <div className="hangar-help" style={{gridColumn:'1/-1'}}>{children}</div>; }
  function Configuration({item}) { return <><HierarchyRow item={item} level={0}/>{(item.children||[]).map((child)=><HierarchyRow key={child.id} item={child} level={1}/>)}</>; }
  function HierarchyRow({item,level}) { const icon=item.kind==='Assembly'||item.kind==='Subassembly'?'layers':item.kind==='Equipment'?'gauge':'settings';return <div className="hangar-tree-row" data-level={level}><div className="hangar-tree-primary"><span className="hangar-tree-icon"><Icon name={icon} size={16}/></span><span className="hangar-tree-copy"><strong>{item.id} · {item.name}</strong><span>{item.meta}</span></span></div><span className="hangar-kind">{item.kind}</span><StatusDot state={item.state} label={item.label}/></div>; }
  function Summary({label,value,caution}) { return <div className="hangar-summary-card"><span style={EYEBROW}>{label}</span><strong style={caution?{color:'var(--ex-amber-500)'}:null}>{value}</strong></div>; }
  function Mini({label,value}) { return <div><span style={EYEBROW}>{label}</span><strong style={{display:'block',marginTop:4,font:'600 12px/1.3 var(--font-data)',color:'var(--text-strong)'}}>{value}</strong></div>; }
  function toneForPart(state) { return state==='quarantined'?'caution':state==='retired'?'fault':state==='available'?'unknown':'ready'; }
  const EYEBROW={fontFamily:'var(--font-mono)',fontSize:10,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--text-muted)'};
  const H1={margin:'4px 0 0',fontSize:24,fontWeight:700,color:'var(--text-strong)'};
  const LEAD={margin:'4px 0 0',fontSize:13,color:'var(--text-muted)'};
  const ICON_BUTTON={width:34,height:34,border:'1px solid var(--border-rule)',borderRadius:6,background:'var(--surface-card)',color:'var(--text-muted)',display:'grid',placeItems:'center',cursor:'pointer'};
  window.OSHangar={Hangar};
})();
