#!/usr/bin/env python3
"""Exercise timer invocations with fake HTTP responses and no network access."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SILLAGE = True
SCRIPT = ROOT / 'ops/bin/sillage-operations'

class ReadinessTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.env = dict(os.environ, PATH=str(self.path) + os.pathsep + os.environ['PATH'],
                        TEST_ROOT=str(self.path), READINESS_STATE_DIRECTORY=str(self.path),
                        SILLAGE_OPERATIONS_STATE_DIRECTORY=str(self.path),
                        HEALTHCHECKS_READY_PING_URL='https://ping.invalid/check',
                        ENV_FILE=str(self.path / 'env'))
        (self.path / 'env').write_text('MONITORING_ENABLED=true\nAPP_HEALTHCHECKS_READY_URL=https://ping.invalid/check\n')
        (self.path / 'flock').write_text('#!/bin/sh\nexit 0\n')
        (self.path / 'curl').write_text("""#!/bin/bash
for arg in "$@"; do
  case "$arg" in
    https://ping.invalid/*) echo "${arg##*/}" >> "$TEST_ROOT/pings"; exit 0 ;;
  esac
done
case "$TEST_RESULT" in
  timeout) echo 'curl: timeout' >&2; exit 28 ;;
  invalid) echo '{"status":"error","ready":false}'; exit 0 ;;
  http503) echo '{"status":"error","ready":false}'; exit 22 ;;
  *) echo '{"status":"ok","ready":true}' ;;
esac
""")
        for name in ('curl', 'flock'):
            (self.path / name).chmod(0o755)

    def run_probe(self, result):
        self.env['TEST_RESULT'] = result
        if SILLAGE:
            command = ['bash', '-c', 'source "$1"; acquire_lock() { :; }; main ready', 'test', str(SCRIPT)]
        else:
            command = ['bash', str(SCRIPT)]
        return subprocess.run(command, env=self.env, capture_output=True, text=True)

    def pings(self):
        p = self.path / 'pings'
        return p.read_text().splitlines() if p.exists() else []

    def test_transient_failure_and_recovery(self):
        self.assertNotEqual(self.run_probe('timeout').returncode, 0)
        self.assertEqual(self.pings(), ['log'])
        self.assertEqual(self.run_probe('ok').returncode, 0)
        self.assertEqual(self.pings(), ['log', 'check'])
        self.assertFalse((self.path / 'ready.failures').exists())
        self.run_probe('timeout')
        self.assertEqual(self.pings()[-1], 'log')

    def test_persistent_outage_and_recovery(self):
        for result in ('timeout', 'http503', 'invalid'):
            self.assertNotEqual(self.run_probe(result).returncode, 0)
        self.assertEqual(self.pings(), ['log', 'log', 'log'])
        self.run_probe('ok')
        self.assertEqual(self.pings()[-1], 'check')

    def test_stale_failure_does_not_confirm_outage(self):
        (self.path / 'ready.failures').write_text('1 1\n')
        self.run_probe('timeout')
        self.assertEqual(self.pings(), ['log'])

    def test_corrupt_state_withholds_heartbeat(self):
        (self.path / 'ready.failures').write_text('invalid state\n')
        self.assertNotEqual(self.run_probe('timeout').returncode, 0)
        self.assertEqual(self.pings(), [])

if __name__ == '__main__':
    unittest.main()
