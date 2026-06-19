Framed container for repeated items and tools — optional eyebrow, title, and header actions. Light by default; `surface="carbon"` makes a dark instrument panel.

```jsx
<Card eyebrow="Flight prep" title="GLD readiness" actions={<Button size="sm">Verify</Button>}>
  …content…
</Card>

<Card surface="carbon" title="Replay" elevation="flat" flush>
  <TrajectoryBand/>
</Card>
```

- **Never nest a Card inside a Card** — use plain framed rows or sections instead.
- `flush` removes body padding for tables/media; `elevation`: `flat | sm | raised`.
