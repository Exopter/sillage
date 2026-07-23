/* Exopter brand site — deep-tech, object-led public page. window.ExopterBrand. */
(function () {
  const DS = window.ExopterDesignSystem_4c9fc9;
  const { Button, Badge, MetricTile } = DS;
  const WING = '../../assets/exopter-wing-reference.jpeg';

  const Eyebrow = ({ children, accent }) => (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, letterSpacing: '.18em', textTransform: 'uppercase', color: accent ? 'var(--ex-aqua-500)' : 'var(--ex-graphite-400)' }}>{children}</span>
  );

  const Reveal = ({ children, style }) => (
    <div className="reveal" style={style}>{children}</div>
  );

  // ---- sections ----
  function Nav() {
    return (
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 20,
        padding: '18px 40px', backdropFilter: 'blur(6px)', background: 'rgba(7,11,13,.55)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <img src="../../assets/logo-wordmark.svg" alt="EXOPTER" style={{ height: 16 }} />
        <nav style={{ display: 'flex', gap: 26, marginLeft: 28 }}>
          {[
            ['Program', '#program'],
            ['Evidence', '#evidence'],
            ['Sillage', '#sillage'],
            ['Roadmap', '#roadmap'],
          ].map(([label, href]) => (
            <a key={label} href={href} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ex-graphite-400)', textDecoration: 'none' }}>{label}</a>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <Badge tone="ready">GLD validated</Badge>
        <Button variant="secondary" size="sm">Request brief</Button>
      </header>
    );
  }

  function Hero() {
    return (
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
        <img src={WING} alt="Exopter rigid wing on a test field" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,11,13,.88) 0%, rgba(7,11,13,.55) 42%, rgba(7,11,13,.15) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(7,11,13,.95) 0%, rgba(7,11,13,0) 38%)' }} />
        <div style={{ position: 'relative', padding: '0 40px 84px', maxWidth: 1000 }}>
          <Eyebrow accent>Personal rigid-wing flight system</Eyebrow>
          <h1 style={{ margin: '18px 0 0', fontSize: 'clamp(48px, 7vw, 104px)', fontWeight: 700, lineHeight: .98, letterSpacing: '-.02em', color: 'var(--ex-white)' }}>
            Human flight,<br />made measurable.
          </h1>
          <p style={{ margin: '24px 0 0', fontSize: 19, lineHeight: 1.5, maxWidth: 560, color: 'var(--ex-vapor-100)' }}>
            A rigid carbon wing from GLD glider validation to EPW electric power — built around
            flight-test evidence, pilot assistance, and the Sillage operating suite.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 30 }}>
            <Button variant="primary">View the program</Button>
            <Button variant="secondary">Flight evidence</Button>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 24, right: 40, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ex-graphite-400)' }}>
          Exowing GLD · field reference ↓
        </div>
      </section>
    );
  }

  function SpecBand() {
    const specs = [
      { label: 'Optimal speed', value: '170–230', unit: 'km/h' },
      { label: 'Wingspan', value: '2.5', unit: 'm' },
      { label: 'GLD distance', value: '>10', unit: 'km' },
      { label: 'EPW distance', value: '>25', unit: 'km' },
      { label: 'Exit altitude', value: '5 000', unit: 'm' },
      { label: 'Parachute', value: '1 500', unit: 'm' },
    ];
    return (
      <section id="program" className="grid-bg" style={{ background: 'var(--ex-carbon-950)', padding: '80px 40px', borderTop: '1px solid var(--ex-carbon-700)' }}>
        <Reveal><Eyebrow>Program truths</Eyebrow>
          <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(30px,4vw,46px)', fontWeight: 700, letterSpacing: '-.01em', color: 'var(--ex-white)', maxWidth: 680 }}>
            Validated as a glider first. Powered next.
          </h2>
          <p style={{ margin: '16px 0 40px', fontSize: 16, color: 'var(--ex-graphite-400)', maxWidth: 620 }}>
            One pilot, 80–95 kg. The first validated stage is GLD — an unpowered rigid wing proving
            aerodynamics, structure, safety, and FDR workflows before electric power is added.
          </p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 1, background: 'var(--ex-carbon-700)', border: '1px solid var(--ex-carbon-700)', borderRadius: 8, overflow: 'hidden' }}>
          {specs.map((s) => (
            <div key={s.label} style={{ background: 'var(--ex-carbon-900)', padding: '22px 20px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ex-graphite-400)' }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums', fontSize: 34, fontWeight: 500, color: 'var(--ex-white)', marginTop: 8, lineHeight: 1 }}>
                {s.value}<span style={{ fontSize: 14, color: 'var(--ex-graphite-400)', marginLeft: 4 }}>{s.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function Evidence() {
    const mods = [
      { k: 'Wing', d: 'Rigid carbon airframe with pitot, pressure, GPS, and camera placement.' },
      { k: 'FDR', d: 'Flight data recording with integrity state, import, and export.' },
      { k: 'HUD', d: 'Sun-readable pilot display, fail-safe to black, GLD / EDF / JET modes.' },
      { k: 'Parachute & jettison', d: 'Rescue parachute, attachment, harness, and emergency deactivation.' },
      { k: 'Telemetry', d: 'Airspeed, altitude, glide, distance, temperature, and power traces.' },
      { k: 'Test path', d: 'CFD, structural, tunnel, drop, and flight tests through acceptance.' },
    ];
    return (
      <section id="evidence" style={{ background: 'var(--ex-carbon-900)', padding: '80px 40px' }}>
        <Reveal><Eyebrow accent>Evidence</Eyebrow>
          <h2 style={{ margin: '14px 0 40px', fontSize: 'clamp(30px,4vw,46px)', fontWeight: 700, letterSpacing: '-.01em', color: 'var(--ex-white)', maxWidth: 680 }}>
            The object is the proof.
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
          {mods.map((m) => (
            <div key={m.k} className="evi" style={{ background: 'var(--ex-carbon-950)', border: '1px solid var(--ex-carbon-700)', borderRadius: 8, padding: '24px 22px', transition: 'border-color .2s' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ex-aqua-500)' }}>{m.k}</div>
              <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.5, color: 'var(--ex-vapor-100)' }}>{m.d}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function OperatingSuite() {
    const rooms = [['Flight', 'Prep, replay, logbook, maintenance'], ['Atlas', 'Maps, terrain, route comparison'], ['Hangar', 'Fleet, hardware, spare parts'], ['Signal', 'Telemetry, live feeds, comms'], ['Forge', 'Agent workflows, documentation'], ['Core', 'Auth, audit, storage, ops']];
    return (
      <section id="os" style={{ background: 'var(--ex-vapor-50)', padding: '80px 40px' }}>
        <Reveal><Eyebrow>Operating suite</Eyebrow>
          <h2 style={{ margin: '14px 0 0', fontSize: 'clamp(30px,4vw,46px)', fontWeight: 700, letterSpacing: '-.01em', color: 'var(--ex-carbon-950)', maxWidth: 720 }}>
            Sillage — one workbench for the full flight lifecycle.
          </h2>
          <p style={{ margin: '16px 0 36px', fontSize: 16, color: 'var(--ex-graphite-600)', maxWidth: 640 }}>
            Prepare, verify, record, replay, compare, inspect, train, certify. One house with
            several rooms — never a jump from the flight lab to an unrelated back office.
          </p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 28 }}>
          {rooms.map(([k, d]) => (
            <div key={k} style={{ background: '#fff', border: '1px solid var(--ex-vapor-200)', borderRadius: 8, padding: '18px 18px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ex-carbon-950)' }}>Sillage {k}</div>
              <div style={{ fontSize: 13, color: 'var(--ex-graphite-600)', marginTop: 4 }}>{d}</div>
            </div>
          ))}
        </div>
        <a href="../os-flight/index.html" style={{ textDecoration: 'none' }}>
          <Button variant="primary">Open Sillage Flight →</Button>
        </a>
      </section>
    );
  }

  function Roadmap() {
    const stages = [
      { t: 'T0 → T0+12', k: 'GLD', d: 'Glider wing validation', s: 'validated' },
      { t: 'T0+12 → T0+18', k: 'EPW / EDF', d: 'Electric-powered wing', s: 'dev' },
      { t: 'T0+18 → T0+24', k: 'Bicopter', d: 'Stability & control', s: 'dev' },
      { t: 'Beyond', k: 'JPW / P1000', d: 'Jet-powered extension', s: 'roadmap' },
    ];
    const tone = { validated: 'ready', dev: 'caution', roadmap: 'neutral' };
    const lab = { validated: 'Validated', dev: 'In development', roadmap: 'Roadmap' };
    return (
      <section id="roadmap" className="grid-bg" style={{ background: 'var(--ex-carbon-950)', padding: '80px 40px', borderTop: '1px solid var(--ex-carbon-700)' }}>
        <Reveal><Eyebrow accent>Roadmap</Eyebrow>
          <h2 style={{ margin: '14px 0 40px', fontSize: 'clamp(30px,4vw,46px)', fontWeight: 700, letterSpacing: '-.01em', color: 'var(--ex-white)', maxWidth: 680 }}>
            Maturity, stated honestly.
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          {stages.map((st) => (
            <div key={st.k} style={{ background: 'var(--ex-carbon-900)', border: '1px solid var(--ex-carbon-700)', borderRadius: 8, padding: '22px 20px', borderTop: '2px solid ' + (st.s === 'validated' ? 'var(--ex-field-500)' : st.s === 'dev' ? 'var(--ex-amber-500)' : 'var(--ex-graphite-600)') }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.08em', color: 'var(--ex-graphite-400)' }}>{st.t}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ex-white)', margin: '10px 0 2px', letterSpacing: '-.01em' }}>{st.k}</div>
              <div style={{ fontSize: 14, color: 'var(--ex-vapor-100)', marginBottom: 14 }}>{st.d}</div>
              <Badge tone={tone[st.s]}>{lab[st.s]}</Badge>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function Footer() {
    return (
      <footer style={{ background: 'var(--ex-carbon-950)', padding: '48px 40px', borderTop: '1px solid var(--ex-carbon-700)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <img src="../../assets/logo-wordmark.svg" alt="EXOPTER" style={{ height: 16, opacity: .9 }} />
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ex-graphite-600)' }}>
          Confidential · personal rigid-wing flight program · non-final marks
        </span>
      </footer>
    );
  }

  function Page() {
    React.useEffect(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const els = document.querySelectorAll('.reveal');
      if (reduce) { els.forEach((e) => e.classList.add('in')); return; }
      const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.18 });
      els.forEach((e) => io.observe(e));
      return () => io.disconnect();
    }, []);
    return (
      <div style={{ background: 'var(--ex-carbon-950)' }}>
        <Nav /><Hero /><SpecBand /><Evidence /><OperatingSuite /><Roadmap /><Footer />
      </div>
    );
  }

  window.ExopterBrand = { Page };
})();
