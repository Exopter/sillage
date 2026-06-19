Compact single-icon control for toolbars, instrument panels, and table rows.

```jsx
<IconButton icon={icon('play')} variant="solid" round label="Play replay" />
<IconButton icon={icon('download')} variant="outline" label="Export FDR" />
<IconButton icon={icon('octagon-x')} variant="danger" label="Abort" />
```

- `variant`: `ghost` (default) · `outline` · `solid` (carbon) · `danger`.
- `round` only for momentary physical controls (play, reset, target); keep the 8px radius otherwise.
- Always pass `label` for accessibility/tooltip.
