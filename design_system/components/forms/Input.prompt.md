Labelled text/number field with optional unit suffix, hint, and error state. Use `data` for right-aligned tabular numeric entry (speeds, masses, altitudes).

```jsx
<Input label="Pilot mass" data suffix="kg" defaultValue="88" hint="Target 80–95 kg" />
<Input label="Flight ID" placeholder="GLD-2026-014" required />
<Input label="Exit altitude" data suffix="m" error="Above 5000 m ceiling" />
```

- `suffix` for units, `prefix` for an icon or short token.
- `error` sets the red state and replaces `hint`.
- Pair with `Select`, `Switch`, and `Button` inside prep/checklist forms.
