/* OS Flight — HUD preview (pilot display concept). window.OSHud. */
(function () {
  const { Icon } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const { SegmentedControl, Switch, Badge, Button } = DS;

  const G = '#8CFF4D', AMBER = '#F2A23A', GREY = '#5F6C6B';

  function Ladder({ value, label, unit, x }) {
    // vertical tape with the current value boxed
    const rows = [-2, -1, 0, 1, 2];
    return (
      <div style={{ position: 'absolute', top: '50%', [x]: 40, transform: 'translateY(-50%)', textAlign: x === 'left' ? 'left' : 'right', fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', color: G }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.12em', color: GREY, marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
        {rows.map((r) => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: x === 'left' ? 'flex-start' : 'flex-end', opacity: r === 0 ? 1 : .4, height: 26 }}>
            {r === 0 ? (
              <span style={{ border: '2px solid ' + G, padding: '2px 8px', fontSize: 30, fontWeight: 600, lineHeight: 1 }}>{value}</span>
            ) : (
              <span style={{ fontSize: 16 }}>{value + r * (label === 'AIRSPEED' ? 5 : 50)}</span>
            )}
          </div>
        ))}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: GREY, marginTop: 6 }}>{unit}</div>
      </div>
    );
  }

  function Hud() {
    const [mode, setMode] = React.useState('gld');
    const [failsafe, setFailsafe] = React.useState(false);
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--text-strong)' }}>HUD preview</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Pilot display concept · readable in sun, fail-safe to black, never full white.</p>
          </div>
          <SegmentedControl ariaLabel="HUD mode" value={mode} onChange={setMode}
            options={[{ value: 'gld', label: 'GLD' }, { value: 'edf', label: 'EDF' }, { value: 'jet', label: 'JET', disabled: true }]} />
          <Switch label="Fail-safe" checked={failsafe} onChange={(e) => setFailsafe(e.target.checked)} />
        </div>

        {/* HUD canvas */}
        <div style={{ position: 'relative', aspectRatio: '16 / 8', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--ex-carbon-700)',
          background: failsafe ? '#070B0D' : 'linear-gradient(180deg,#0b1418 0%,#0a1012 52%,#0c0f0e 52%,#070b0d 100%)' }}>
          {failsafe ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '.2em', color: GREY, textTransform: 'uppercase' }}>Fail-safe · display blank</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#2a3433' }}>Recover outside HUD context — no white flash</span>
            </div>
          ) : (
            <React.Fragment>
              {/* horizon */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: '52%', height: 1, background: G, opacity: .5 }} />
              {/* compass top */}
              <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 22, fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', color: G, fontSize: 13, alignItems: 'center' }}>
                <span style={{ opacity: .4 }}>33</span><span style={{ opacity: .6 }}>N</span>
                <span style={{ fontSize: 18, fontWeight: 600, borderBottom: '2px solid ' + G, paddingBottom: 2 }}>036</span>
                <span style={{ opacity: .6 }}>06</span><span style={{ opacity: .4 }}>09</span>
              </div>
              {/* flight path marker */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: G }}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke={G} strokeWidth="2"><circle cx="24" cy="24" r="7" /><line x1="31" y1="24" x2="42" y2="24" /><line x1="17" y1="24" x2="6" y2="24" /><line x1="24" y1="17" x2="24" y2="9" /></svg>
              </div>
              {/* waypoint cylinder hint */}
              <div style={{ position: 'absolute', top: '34%', left: '63%', color: AMBER, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <svg width="26" height="34" viewBox="0 0 26 34" fill="none" stroke={AMBER} strokeWidth="1.5"><ellipse cx="13" cy="6" rx="11" ry="4" /><ellipse cx="13" cy="28" rx="11" ry="4" /><line x1="2" y1="6" x2="2" y2="28" /><line x1="24" y1="6" x2="24" y2="28" /></svg>
                <div style={{ marginTop: 2 }}>WPT 2 · 3.1 km</div>
              </div>
              <Ladder value={214} label="AIRSPEED" unit="km/h" x="left" />
              <Ladder value={1480} label="ALTITUDE" unit="m" x="right" />
              {/* glide & distance center-bottom */}
              <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 40, color: G, fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
                <div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: GREY, letterSpacing: '.1em' }}>GLIDE</div><div style={{ fontSize: 22, fontWeight: 600 }}>12.4</div></div>
                <div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: GREY, letterSpacing: '.1em' }}>DIST</div><div style={{ fontSize: 22, fontWeight: 600 }}>8.6<span style={{ fontSize: 12, color: GREY }}> km</span></div></div>
                <div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: GREY, letterSpacing: '.1em' }}>TCAS</div><div style={{ fontSize: 22, fontWeight: 600, color: GREY }}>—</div></div>
              </div>
              {/* fault area — consistent location, top-right */}
              <div style={{ position: 'absolute', top: 12, right: 16, display: 'flex', alignItems: 'center', gap: 6, color: AMBER, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '.08em' }}>
                <Icon name="triangle-alert" size={13} /> BATT 74%
              </div>
              {/* mode tag */}
              <div style={{ position: 'absolute', bottom: 14, left: 16, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '.12em', color: G }}>{mode.toUpperCase()}</div>
            </React.Fragment>
          )}
        </div>

        <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
          {[['Primary data', G], ['Caution', AMBER], ['Inactive / unknown', GREY]].map(([k, c]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>
              <i style={{ width: 10, height: 10, borderRadius: 2, background: c }} /> {k}
            </span>
          ))}
        </div>
      </div>
    );
  }
  window.OSHud = { Hud };
})();
