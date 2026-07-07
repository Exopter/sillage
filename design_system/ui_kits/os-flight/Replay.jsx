/* OS Flight — Replay screen (dark instrument band). window.OSReplay. */
(function () {
  const { Icon } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const { IconButton, Button, MetricTile, Badge, StatusDot } = DS;

  // --- Synthetic flight samples (N points over the recording) ---
  const N = 120;
  const T_TOTAL = 432; // seconds (07:12)
  const samples = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    const alt = 1520 * (1 - t) + 40 * Math.sin(t * 9) + 30;
    const spd = 198 + 26 * Math.sin(t * 7 + 1) + 8 * Math.sin(t * 21);
    const gld = 12.6 - 1.2 * Math.sin(t * 5 + 0.5);
    const vs = -(4.6 + 1.8 * Math.sin(t * 7 + 1));
    const g = 1 + 0.35 * Math.sin(t * 17);
    return { alt, spd, gld, vs, g };
  });
  const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // Build an SVG path string from accessor over viewBox w/h
  function pathFor(acc, min, max, w, h, pad) {
    return samples.map((s, i) => {
      const x = pad + (i / (N - 1)) * (w - 2 * pad);
      const y = pad + (1 - (acc(s) - min) / (max - min)) * (h - 2 * pad);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  function Replay({ flight, onBack }) {
    const f = flight || { id: 'GLD-2026-018', mode: 'GLD' };
    const [idx, setIdx] = React.useState(Math.floor(N * 0.46));
    const [playing, setPlaying] = React.useState(false);
    const raf = React.useRef(null);

    React.useEffect(() => {
      if (!playing) return;
      let last = performance.now();
      const tick = (now) => {
        const dt = (now - last) / 1000; last = now;
        setIdx((p) => {
          const next = p + dt * (N / T_TOTAL) * 6; // 6x speed
          if (next >= N - 1) { setPlaying(false); return N - 1; }
          return next;
        });
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf.current);
    }, [playing]);

    const i = Math.round(idx);
    const cur = samples[i];
    const tNow = (i / (N - 1)) * T_TOTAL;

    // trajectory band geometry
    const W = 760, H = 240, PAD = 24;
    const altPath = pathFor((s) => s.alt, 0, 1600, W, H, PAD);
    const dotX = PAD + (i / (N - 1)) * (W - 2 * PAD);
    const dotY = PAD + (1 - cur.alt / 1600) * (H - 2 * PAD);

    // telemetry chart geometry
    const CW = 760, CH = 150, CPAD = 18;
    const spdPath = pathFor((s) => s.spd, 150, 240, CW, CH, CPAD);
    const altMini = pathFor((s) => s.alt, 0, 1600, CW, CH, CPAD);
    const scrubX = CPAD + (i / (N - 1)) * (CW - 2 * CPAD);

    const events = [
      { t: '00:00', label: 'T0 exit · 1520 m', state: 'ready' },
      { t: '02:14', label: 'Best glide window', state: 'live' },
      { t: '04:02', label: 'Airspeed dip −12 km/h', state: 'caution' },
      { t: '07:12', label: 'Flare · landing', state: 'ready' },
    ];

    return (
      <div className="ex-dark" style={{ minHeight: '100%', background: 'var(--ex-carbon-950)', color: 'var(--ex-vapor-50)', display: 'flex', flexDirection: 'column' }}>
        {/* sub-header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: '1px solid var(--ex-carbon-700)' }}>
          <IconButton icon={<Icon name="chevron-right" size={18} style={{ transform: 'rotate(180deg)' }} />} variant="ghost" label="Back to logbook" onClick={onBack} />
          <span style={{ fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', fontSize: 17, fontWeight: 600 }}>{f.id}</span>
          <Badge tone={f.mode === 'EDF' ? 'info' : 'solid'}>{f.mode}</Badge>
          <Badge tone="neutral">Replay</Badge>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" iconLeft={<Icon name="activity" size={18} />}>Compare</Button>
          <Button variant="secondary" iconLeft={<Icon name="download" size={18} />}>Export FDR</Button>
        </div>

        <div style={{ display: 'flex', gap: 16, padding: 16, flex: 1, minHeight: 0, flexWrap: 'wrap' }}>
          {/* left: trajectory + telemetry */}
          <div style={{ flex: '1 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* trajectory band */}
            <div style={{ background: 'var(--ex-carbon-900)', border: '1px solid var(--ex-carbon-700)', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ex-graphite-400)' }}>Altitude profile · side view</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ex-graphite-400)' }}>Exit → flare</span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                {[0, 0.25, 0.5, 0.75, 1].map((g) => {
                  const y = PAD + g * (H - 2 * PAD);
                  return (<g key={g}>
                    <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#21302F" strokeWidth="1" />
                    <text x={4} y={y + 3} fill="#5F6C6B" fontSize="9" fontFamily="var(--font-mono)">{Math.round(1600 * (1 - g))}</text>
                  </g>);
                })}
                <path d={`${altPath} L ${W - PAD} ${H - PAD} L ${PAD} ${H - PAD} Z`} fill="rgba(47,214,198,.08)" stroke="none" />
                <path d={altPath} fill="none" stroke="var(--ex-aqua-500)" strokeWidth="2" />
                <line x1={dotX} y1={PAD} x2={dotX} y2={H - PAD} stroke="#2FD6C6" strokeWidth="1" strokeDasharray="3 4" opacity=".5" />
                <circle cx={dotX} cy={dotY} r="5" fill="var(--ex-hud-green)" stroke="#070B0D" strokeWidth="1.5" />
              </svg>
            </div>
            {/* telemetry chart */}
            <div style={{ background: 'var(--ex-carbon-900)', border: '1px solid var(--ex-carbon-700)', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ex-graphite-400)' }}>Telemetry</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ex-vapor-50)' }}><i style={{ width: 10, height: 2, background: 'var(--ex-sky-500)' }} /> Airspeed</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ex-vapor-50)' }}><i style={{ width: 10, height: 2, background: 'var(--ex-aqua-500)' }} /> Altitude</span>
              </div>
              <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                <path d={altMini} fill="none" stroke="var(--ex-aqua-500)" strokeWidth="1.5" opacity=".5" />
                <path d={spdPath} fill="none" stroke="var(--ex-sky-500)" strokeWidth="2" />
                <line x1={scrubX} y1={4} x2={scrubX} y2={CH - 4} stroke="#8CFF4D" strokeWidth="1" />
              </svg>
            </div>
          </div>

          {/* right: live readouts + events */}
          <div style={{ flex: '0 0 230px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MetricTile label="Airspeed" value={cur.spd.toFixed(0)} unit="km/h" state="live" sunken />
              <MetricTile label="Altitude" value={cur.alt.toFixed(0)} unit="m" sunken />
              <MetricTile label="Glide" value={cur.gld.toFixed(1)} unit="L/D" state="ready" sunken />
              <MetricTile label="V-speed" value={cur.vs.toFixed(1)} unit="m/s" sunken />
            </div>
            <div style={{ background: 'var(--ex-carbon-900)', border: '1px solid var(--ex-carbon-700)', borderRadius: 8, padding: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ex-graphite-400)' }}>Events</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {events.map((e) => (
                  <div key={e.t} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--ex-graphite-400)', width: 42, flex: 'none' }}>{e.t}</span>
                    <div><StatusDot state={e.state} label={e.label} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* scrubber */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderTop: '1px solid var(--ex-carbon-700)', background: 'var(--ex-carbon-900)' }}>
          <IconButton icon={<Icon name={playing ? 'pause' : 'play'} size={18} />} variant="solid" round label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)} />
          <IconButton icon={<Icon name="rotate-ccw" size={18} />} variant="ghost" label="Restart" onClick={() => { setIdx(0); setPlaying(false); }} />
          <span style={{ fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--ex-hud-green)', width: 52 }}>{fmtT(tNow)}</span>
          <input type="range" min="0" max={N - 1} step="1" value={i} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
            style={{ flex: 1, accentColor: '#2FD6C6', height: 4 }} />
          <span style={{ fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--ex-graphite-400)', width: 52, textAlign: 'right' }}>{fmtT(T_TOTAL)}</span>
        </div>
      </div>
    );
  }
  window.OSReplay = { Replay };
})();
