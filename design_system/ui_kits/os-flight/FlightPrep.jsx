/* Sillage Flight — Flight prep / readiness screen. window.OSFlightPrep. */
(function () {
  const { Icon } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const { Card, ChecklistRow, ReadinessStrip, MetricTile, Button, Switch, Badge } = DS;

  function SafetyGate({ armed, onArm }) {
    return (
      <div style={{ border: '2px solid ' + (armed ? 'var(--ex-field-500)' : 'var(--ex-amber-500)'), borderRadius: 8, background: 'var(--surface-card)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ color: armed ? 'var(--ex-field-500)' : 'var(--ex-amber-500)', display: 'flex' }}><Icon name="shield" size={18} /></span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-strong)' }}>Safety gate · arm system</span>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', maxWidth: 360 }}>
          {armed ? 'System armed. Parachute opening set 1500 m. Disarm before any ground handling.'
                 : 'Requires human approval. All readiness items must pass before arming. This is a safety-critical action.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {armed
            ? <Button variant="danger" iconLeft={<Icon name="octagon-x" size={18} />} onClick={onArm}>Disarm</Button>
            : <Button variant="primary" iconLeft={<Icon name="shield" size={18} />} onClick={onArm}>Arm system</Button>}
          <Badge tone={armed ? 'ready' : 'caution'}>{armed ? 'Armed' : 'Awaiting approval'}</Badge>
        </div>
      </div>
    );
  }

  function FlightPrep() {
    const [armed, setArmed] = React.useState(false);
    const items = [
      { label: 'Pilot', value: 'A. Renaud · 88 kg', state: 'ready' },
      { label: 'Weather', value: 'CAVOK · 6 kt', state: 'ready' },
      { label: 'Battery', value: '74%', state: 'caution' },
      { label: 'FDR', value: 'Armed', state: 'live' },
      { label: 'Comms', value: 'VHF + intercom', state: 'ready' },
      { label: 'Parachute', value: 'Check pending', state: 'pending' },
    ];
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--text-strong)' }}>Flight prep · GLD-2026-019</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Verify GLD flight readiness before arming the system.</p>
        </div>

        <div style={{ marginBottom: 18 }}><ReadinessStrip mode="GLD" items={items} /></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
          <Card eyebrow="Pre-flight" title="Readiness checklist" flush
            actions={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>4 / 7 passed</span>}>
            <div style={{ padding: 4 }}>
              <ChecklistRow state="done" title="Harness, hooks & attachment inspected" owner="PILOT" evidence="#" />
              <ChecklistRow state="done" title="Wing surface & control check" owner="ENG-2" evidence="#" />
              <ChecklistRow state="done" title="Pitot / pressure probe clear" owner="ENG-2" evidence="#" />
              <ChecklistRow state="active" title="Parachute pack & jettison verified" owner="ENG-1" />
              <ChecklistRow state="blocked" title="Battery above 80%" blocker="At 74% — charge before EDF leg" owner="OPS" />
              <ChecklistRow state="pending" title="Audible altimeter test" owner="PILOT" />
              <ChecklistRow state="pending" title="Weather window confirmed" owner="OPS" />
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MetricTile label="Wind" icon={<Icon name="wind" size={13} />} value="6" unit="kt" state="ready" />
              <MetricTile label="OAT" icon={<Icon name="thermometer" size={13} />} value="19" unit="°C" />
              <MetricTile label="Battery" icon={<Icon name="battery" size={13} />} value="74" unit="%" state="caution" />
              <MetricTile label="Ceiling" value="5 000" unit="m" />
            </div>
            <SafetyGate armed={armed} onArm={() => setArmed((a) => !a)} />
            <Card eyebrow="Hardware" title="Sensor placement" elevation="flat">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[['Wing', 'Pitot · GPS · camera'], ['Seat', 'Attitude · GPS · VHF'], ['Helmet', 'GPS · intercom · HUD']].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{k}</span>
                    <span style={{ color: 'var(--text-body)' }}>{v}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }
  window.OSFlightPrep = { FlightPrep };
})();
