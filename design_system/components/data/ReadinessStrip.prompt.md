Dense horizontal status band that puts current state first — the operational header for a flight/test view. Each segment shows a value and a status dot.

```jsx
<ReadinessStrip mode="GLD" items={[
  { label: 'Pilot',   value: 'A. Renaud · 88 kg', state: 'ready' },
  { label: 'Weather', value: 'CAVOK · 6 kt',       state: 'ready' },
  { label: 'Battery', value: '74%',                state: 'caution' },
  { label: 'FDR',     value: 'Armed',              state: 'live' },
  { label: 'Comms',   value: 'VHF + intercom',     state: 'ready' },
  { label: 'Parachute', value: 'Check pending',    state: 'pending' },
]} />
```

- `state`: `ready | live | pending | caution | fault | unknown` (pending renders a hollow ring).
- Group readiness items before fault items; keep values short and tabular.
