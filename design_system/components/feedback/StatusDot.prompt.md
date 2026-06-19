Inline state indicator — colored dot plus uppercase label. The workhorse for readiness strips, table rows, and system lists.

```jsx
<StatusDot state="ready" />
<StatusDot state="live" pulse label="Streaming" />
<StatusDot state="pending" />     {/* hollow amber ring */}
<StatusDot state="fault" />
<StatusDot state="unknown" label="No data" />
```

- `pending` renders a hollow ring; all others a solid dot.
- `pulse` adds an animated ring (respects reduced-motion) — reserve for live/active.
