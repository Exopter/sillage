Operational button for primary, secondary, and destructive actions — carbon-filled by default, with outline/ghost/danger variants and sm/md/lg sizes.

```jsx
<Button variant="primary" onClick={arm}>Arm system</Button>
<Button variant="secondary" iconLeft={icon('rotate-ccw')}>Replay T0</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="danger" iconLeft={icon('octagon-x')}>Abort</Button>
```

- `variant`: `primary` (carbon fill) · `secondary` (outline) · `ghost` (chrome on hover) · `danger` (red, destructive/abort only).
- `size`: `sm` (28px) · `md` (36px, default) · `lg` (44px, min touch target).
- `block` stretches full width; `iconLeft`/`iconRight` take 18px icon nodes.
- Reserve `primary` for the single most important action in a view; never use HUD green on buttons.
