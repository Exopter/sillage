Checklist item for flight prep, maintenance, test, or acceptance — completion state, owner, blocker, and an evidence link. Stack rows directly (they share borders).

```jsx
<ChecklistRow state="done"    title="Harness & hooks inspected" owner="PILOT" evidence="#" />
<ChecklistRow state="active"  title="Parachute pack verified"   owner="ENG-2" />
<ChecklistRow state="blocked" title="Airspeed cross-check" blocker="Pitot fault — replace probe" owner="ENG-1" />
<ChecklistRow state="pending" title="Weather window confirmed" owner="OPS" />
```

- `state`: `done` (green tick) · `active` (aqua) · `pending` · `blocked` (red).
- Pass `blocker` to surface a fault inline; `evidence` adds a traceability link.
