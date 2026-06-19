Physical-style on/off toggle for binary settings (record, audible altimeter, autonomy). Field green when on.

```jsx
<Switch label="Audible altimeter" defaultChecked />
<Switch label="Record FDR" checked={rec} onChange={e => setRec(e.target.checked)} />
```

- Controlled (`checked`+`onChange`) or uncontrolled (`defaultChecked`).
- For a safety-critical state, pair with an explicit status label nearby — don't rely on the toggle color alone.
