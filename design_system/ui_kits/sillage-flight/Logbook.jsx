/* Sillage Flight — Logbook screen. window.SillageLogbook. */
(function () {
  const { Icon } = window.SillageIcons;
  const DS = window.ExopterDesignSystem_4c9fc9;
  const { Button, Input, Badge, StatusDot } = DS;

  const FLIGHTS = [
    { id: 'GLD-2026-018', mode: 'GLD', date: '14 Jun · 09:42', dur: '00:07:12', alt: '1 520', glide: '12.6', state: 'ready', label: 'Analysed' },
    { id: 'GLD-2026-017', mode: 'GLD', date: '14 Jun · 08:15', dur: '00:06:48', alt: '1 480', glide: '12.4', state: 'ready', label: 'Analysed' },
    { id: 'GLD-2026-016', mode: 'GLD', date: '11 Jun · 16:03', dur: '00:05:31', alt: '1 350', glide: '11.9', state: 'caution', label: 'Sensor flag' },
    { id: 'EDF-2026-009', mode: 'EDF', date: '09 Jun · 11:27', dur: '00:11:54', alt: '2 100', glide: '—', state: 'live', label: 'Processing' },
    { id: 'GLD-2026-015', mode: 'GLD', date: '07 Jun · 10:09', dur: '00:06:02', alt: '1 410', glide: '12.1', state: 'ready', label: 'Analysed' },
    { id: 'GLD-2026-014', mode: 'GLD', date: '04 Jun · 15:44', dur: '00:04:58', alt: '1 280', glide: '11.6', state: 'fault', label: 'Pitot fault' },
  ];

  const TH = { textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '0 16px 10px', whiteSpace: 'nowrap' };
  const TD = { padding: '13px 16px', borderTop: '1px solid var(--border-rule)', fontSize: 14, color: 'var(--text-body)', whiteSpace: 'nowrap' };
  const num = { fontFamily: 'var(--font-data)', fontVariantNumeric: 'tabular-nums' };

  function Logbook({ onOpen }) {
    const [q, setQ] = React.useState('');
    const rows = FLIGHTS.filter(f => f.id.toLowerCase().includes(q.toLowerCase()));
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--text-strong)' }}>Logbook</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Recorded flights — replay, compare glide ratio, and inspect FDR.</p>
          </div>
          <div style={{ width: 230 }}>
            <Input prefix={<Icon name="search" size={16} />} placeholder="Search flight ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="primary" iconLeft={<Icon name="upload" size={18} />}>Import FDR</Button>
        </div>

        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-rule)', borderRadius: 8, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...TH, paddingTop: 16 }}>Flight</th>
              <th style={{ ...TH, paddingTop: 16 }}>Mode</th>
              <th style={{ ...TH, paddingTop: 16 }}>Date</th>
              <th style={{ ...TH, paddingTop: 16 }}>Duration</th>
              <th style={{ ...TH, paddingTop: 16 }}>Max alt</th>
              <th style={{ ...TH, paddingTop: 16 }}>Glide</th>
              <th style={{ ...TH, paddingTop: 16 }}>Status</th>
              <th style={{ ...TH, paddingTop: 16 }}></th>
            </tr></thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} onClick={() => onOpen(f)} style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...TD, ...num, fontWeight: 600, color: 'var(--text-strong)' }}>{f.id}</td>
                  <td style={TD}><Badge tone={f.mode === 'EDF' ? 'info' : 'solid'}>{f.mode}</Badge></td>
                  <td style={{ ...TD, ...num, color: 'var(--text-muted)' }}>{f.date}</td>
                  <td style={{ ...TD, ...num }}>{f.dur}</td>
                  <td style={{ ...TD, ...num }}>{f.alt} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>m</span></td>
                  <td style={{ ...TD, ...num }}>{f.glide}</td>
                  <td style={TD}><StatusDot state={f.state} label={f.label} /></td>
                  <td style={{ ...TD, textAlign: 'right', color: 'var(--text-muted)' }}><Icon name="chevron-right" size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  window.SillageLogbook = { Logbook };
})();
