# Readiness alert confirmation

The minute timer sends `/log` for every failed cycle, never failure, synthetic
success, or `/start`. Only a successful probe refreshes the Healthchecks deadline
and reports recovery. Healthchecks applies its 15-minute grace after the next
expected successful observation. Missing monitor runs and failed ping delivery
remain covered by that same deadline. The counter is diagnostic only.

The public readiness endpoint remains authoritative. HTTP failures, timeouts,
and unhealthy response bodies count as failures. Probe errors remain visible
in the service journal and Healthchecks ping body. This filters isolated
interruptions; it does not repair their underlying network or application cause.

State is atomically replaced under the existing operation lock (Sillage) or a
dedicated flock (Tandem Manager). Invalid or unwritable state withholds the
heartbeat instead of reporting health. The failure counter survives processes
and host restarts; stale failures are discarded.

Run `python3 test/operations/readiness_monitor_test.py` for isolated failure,
persistent outage, recovery, stale state, and corrupt state coverage.

## Installation scope

Production installation requires explicit approval. Replace only the readiness
monitor script, retaining a rollback copy. For Sillage, also install the updated
readiness service timeout and run `systemctl daemon-reload`. For Tandem Manager,
install `ops/monitoring/check-ready.sh` at
`/opt/tandem-manager-monitoring/bin/check-ready.sh`; its existing environment
file and timer remain in use. Verify the next scheduled execution and ping.
No application deployment or restart is required.
