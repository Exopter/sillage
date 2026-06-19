Compact uppercase status or mode token. Always carries a label so it never relies on color alone.

```jsx
<Badge tone="ready" icon={icon('check')}>Ready</Badge>
<Badge tone="live">Live</Badge>
<Badge tone="caution">Pending</Badge>
<Badge tone="fault">Fault</Badge>
<Badge tone="solid">GLD</Badge>
```

- `tone`: `neutral` · `ready` (field green) · `live` (aqua) · `caution` (amber) · `fault` (red) · `info` (sky) · `solid` (carbon).
- For an inline list-row status, pair with `StatusDot` or use the badge alone.
