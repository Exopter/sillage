/* Sillage Atlas — canonical landing-zone library and geographic context. */
(function () {
  const { Icon } = window.OSIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const { Badge, Button } = DS;

  const ZONES = [
    { name: 'Tournon Valley', elev: '642 m AMSL', surface: 'Grass · 410 m', wind: '12 kt', access: 'Track from the D20', coordinates: '44.1994, 5.7168', notes: 'Open grass axis in the valley. Best approach from the south; livestock may be present near the eastern boundary.' },
    { name: 'Saint-Auban North', elev: '461 m AMSL', surface: 'Grass · 360 m', wind: '10 kt', access: 'North gate', coordinates: '44.0748, 5.9971', notes: 'Flat field north of the airfield. Keep clear of the road and use the western half after heavy rain.' },
    { name: 'Laragne East', elev: '573 m AMSL', surface: 'Mixed · 290 m', wind: '8 kt', access: 'Farm road', coordinates: '44.3095, 5.8332', notes: 'Shorter mixed surface with a slight upslope. Trees define the northern edge; vehicle access is limited.' },
  ];

  function Atlas() {
    const [selected, setSelected] = React.useState(0);
    const zone = ZONES[selected];
    return (
      <div style={{ padding: 20, maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <span style={EYEBROW}>Sillage Atlas</span>
            <h1 style={H1}>Landing zones</h1>
            <p style={LEAD}>Landing sites with a map, practical information, and field notes.</p>
          </div>
          <Button variant="secondary" iconLeft={<Icon name="plus" size={18} />}>Add landing zone</Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 14 }}>
          <aside style={PANEL}>
            <div style={{ padding: 14, borderBottom: '1px solid var(--border-rule)' }}><span style={EYEBROW}>Available sites</span></div>
            {ZONES.map((z, i) => (
              <button key={z.name} onClick={() => setSelected(i)} style={{ width: '100%', padding: 14, textAlign: 'left', border: 0, borderBottom: '1px solid var(--border-rule)', background: i === selected ? 'var(--surface-hover)' : 'transparent', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ color: 'var(--text-strong)', fontSize: 14 }}>{z.name}</strong>
                  <Icon name="chevron-right" size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
                <div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--text-muted)' }}><span>{z.elev}</span><span>{z.surface}</span></div>
                <p style={{ ...LEAD, marginTop: 8, lineHeight: 1.35 }}>{z.notes}</p>
              </button>
            ))}
          </aside>

          <section style={{ ...PANEL, overflow: 'hidden' }}>
            <div style={{ height: 430, position: 'relative', backgroundImage: 'url(../../assets/landing-zone-terrain-v1.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,11,13,.22)' }} />
              <div style={{ position: 'absolute', left: '62%', top: '52%', transform: 'translate(-50%,-50%)', color: 'var(--ex-hud-green)', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid currentColor', display: 'grid', placeItems: 'center', background: 'rgba(7,11,13,.7)' }}><Icon name="crosshair" size={24} /></div>
                <div style={{ ...EYEBROW, marginTop: 8, color: 'var(--ex-vapor-50)', background: 'rgba(7,11,13,.82)', padding: '5px 8px', borderRadius: 4 }}>{zone.name} · Landing zone</div>
              </div>
              <Badge tone="neutral" className="atlas-map-badge">Terrain · cached 09:08 UTC</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 0, borderTop: '1px solid var(--border-rule)' }}>
              <div style={{ padding: 16, borderRight: '1px solid var(--border-rule)' }}>
                <span style={EYEBROW}>Notes</span>
                <h2 style={{ margin: '6px 0 6px', fontSize: 19, color: 'var(--text-strong)' }}>{zone.name}</h2>
                <p style={{ ...LEAD, margin: 0, lineHeight: 1.5 }}>{zone.notes}</p>
              </div>
              <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
                <Metric label="Elevation" value={zone.elev} />
                <Metric label="Surface" value={zone.surface} />
                <Metric label="Wind limit" value={zone.wind} />
                <Metric label="Access" value={zone.access} />
                <div style={{ gridColumn: '1 / -1' }}><Metric label="Coordinates" value={zone.coordinates} /></div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  function Metric({ label, value }) { return <div><span style={EYEBROW}>{label}</span><strong style={{ display: 'block', marginTop: 4, fontFamily: 'var(--font-data)', fontSize: 13, color: 'var(--text-strong)' }}>{value}</strong></div>; }
  const EYEBROW = { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' };
  const H1 = { margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: 'var(--text-strong)' };
  const LEAD = { margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' };
  const PANEL = { background: 'var(--surface-card)', border: '1px solid var(--border-rule)', borderRadius: 8, boxShadow: 'var(--shadow-sm)' };
  window.OSAtlas = { Atlas };
})();
