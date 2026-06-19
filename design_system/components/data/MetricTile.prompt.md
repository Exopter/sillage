Instrument readout tile — large tabular numeral, short unit, optional trend delta. Stable dimensions so a row of tiles never jitters.

```jsx
<MetricTile label="Airspeed" value="214" unit="km/h" state="live" />
<MetricTile label="Altitude" value="1 480" unit="m" delta="120" trend="down" />
<MetricTile label="Glide" value="12.4" unit="L/D" delta="0.3" trend="up" state="ready" />
<MetricTile label="Battery" value="74" unit="%" state="caution" sunken />
```

- `state` tints the value (`ready`/`caution`/`fault`/`live`); keep neutral for plain readouts.
- Use inside `ReadinessStrip` or a metric grid; pair with `Card`.
