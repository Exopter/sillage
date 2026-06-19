Native select with instrument chrome — for pilot, wing, or mode choices where a segmented control is too wide.

```jsx
<Select label="Pilot" options={[
  { value: 'p1', label: 'A. Renaud — 88 kg' },
  { value: 'p2', label: 'M. Olsen — 91 kg' },
]} />
```

- Pass `options` or `<option>` children.
- Use `SegmentedControl` instead for ≤3 short, always-visible modes.
