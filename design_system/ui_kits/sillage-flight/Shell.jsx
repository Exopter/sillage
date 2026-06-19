/* Sillage Flight — application shell: left rail + top header. Exposes window.SillageShell. */
(function () {
  const { Icon } = window.SillageIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const { SegmentedControl, IconButton, Badge } = DS;

  const ROOMS = [
    { id: 'flight', label: 'Flight', icon: 'plane' },
    { id: 'atlas', label: 'Atlas', icon: 'map' },
    { id: 'hangar', label: 'Hangar', icon: 'wrench' },
    { id: 'signal', label: 'Signal', icon: 'signal' },
    { id: 'forge', label: 'Forge', icon: 'layers' },
    { id: 'core', label: 'Core', icon: 'shield' },
  ];

  function Rail({ room, onRoom }) {
    return (
      <nav style={{
        width: 64, flex: 'none', background: 'var(--ex-carbon-950)', color: 'var(--ex-vapor-50)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 6,
        borderRight: '1px solid var(--ex-carbon-700)',
      }}>
        <a href="../../index.html" title="Design system" style={{ marginBottom: 10, display: 'flex' }}>
          <img src="../../assets/app-icon.svg" alt="Exopter" style={{ width: 30, height: 30, borderRadius: 7 }} />
        </a>
        {ROOMS.map((r) => {
          const active = r.id === room;
          return (
            <button key={r.id} title={r.label} onClick={() => onRoom(r.id)} style={{
              width: 44, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              background: active ? 'var(--ex-carbon-800)' : 'transparent',
              color: active ? 'var(--ex-aqua-500)' : 'var(--ex-graphite-400)',
              transition: 'background .18s, color .18s',
            }}>
              <Icon name={r.icon} size={18} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '.06em', textTransform: 'uppercase' }}>{r.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  function Header({ mode, onMode, title, crumb }) {
    return (
      <header style={{
        height: 56, flex: 'none', display: 'flex', alignItems: 'center', gap: 16,
        padding: '0 20px', background: 'var(--ex-carbon-900)', color: 'var(--ex-vapor-50)',
        borderBottom: '1px solid var(--ex-carbon-700)',
      }}>
        <img src="../../assets/logo-wordmark.svg" alt="EXOPTER" style={{ height: 16, opacity: .95 }} />
        <span style={{ width: 1, height: 22, background: 'var(--ex-carbon-700)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ex-graphite-400)' }}>Sillage Flight · {crumb}</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        </div>
        <div style={{ flex: 1 }} />
        <div className="ex-dark"><SegmentedControl ariaLabel="Flight mode" defaultValue="gld"
          options={[{ value: 'gld', label: 'GLD' }, { value: 'edf', label: 'EDF' }, { value: 'jet', label: 'JET', disabled: true }]}
          value={mode} onChange={onMode} /></div>
        <div className="ex-dark"><Badge tone="live">T0+06:32</Badge></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
          <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--ex-field-500)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>AR</span>
        </div>
      </header>
    );
  }

  function Shell({ room, onRoom, mode, onMode, title, crumb, children }) {
    return (
      <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--surface-app)' }}>
        <Rail room={room} onRoom={onRoom} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Header mode={mode} onMode={onMode} title={title} crumb={crumb} />
          <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</main>
        </div>
      </div>
    );
  }

  window.SillageShell = { Shell, ROOMS };
})();
