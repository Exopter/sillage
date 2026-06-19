Instrument-style mode switcher — the canonical GLD / EDF / JET (or Flight / Forge / Core) control. Mode label always visible; selection is never communicated by color alone.

```jsx
<SegmentedControl
  ariaLabel="Flight mode"
  options={[
    { value: 'gld', label: 'GLD' },
    { value: 'edf', label: 'EDF' },
    { value: 'jet', label: 'JET', disabled: true },
  ]}
  defaultValue="gld"
  onChange={setMode}
/>
```

- Controlled (`value`+`onChange`) or uncontrolled (`defaultValue`).
- Each option may carry an `icon` and `disabled` (use for roadmap-immature modes like JET).
- `size="lg"` for primary dashboard mode bars.
