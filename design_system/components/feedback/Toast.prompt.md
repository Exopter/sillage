Transient operational notification with a tone-keyed left accent rule. Keep copy factual and specific.

```jsx
<Toast tone="ready" title="FDR-118 synced" onClose={dismiss}>
  Flight data uploaded · integrity verified.
</Toast>
<Toast tone="fault" title="Sensor fault" icon={icon('triangle-alert')}>
  Pitot pressure lost — do not rely on airspeed.
</Toast>
```

- `tone`: `info` (sky) · `ready` (field green) · `caution` (amber) · `fault` (red).
- Provide `onClose` to render a dismiss button.
