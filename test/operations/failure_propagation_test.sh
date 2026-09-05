#!/usr/bin/env bash
set -Eeuo pipefail

SILLAGE_OPERATIONS_STATE_DIRECTORY=$(mktemp -d)
trap 'rm -rf "$SILLAGE_OPERATIONS_STATE_DIRECTORY"' EXIT
source "$(dirname "${BASH_SOURCE[0]}")/../../ops/bin/sillage-operations"

ping_healthcheck() { printf '%s\n' "${2:-success}" >> "$STATE_DIRECTORY/pings"; }
docker() { [[ "$docker_status" == 0 ]] || return "$docker_status"; printf '%s\n' "$archive_stats"; }
curl() { [[ "$curl_status" == 0 ]] || return "$curl_status"; printf '%s\n' "$ready_body"; }
stat() { echo "$backup_time"; }
touch() { echo touched >> "$STATE_DIRECTORY/touches"; command touch "$@"; }

assert_failure() {
  : > "$STATE_DIRECTORY/pings"
  if run_monitored example no "$@" > "$STATE_DIRECTORY/output" 2>&1; then
    echo "Unexpected success: $*" >&2
    exit 1
  fi
  [[ "$(cat "$STATE_DIRECTORY/pings")" == /fail ]]
  [[ ! -e "$STATE_DIRECTORY/touches" ]]
}

docker_status=42
curl_status=22
archive_stats='10|0|100'
ready_body='{"status":"ok"}'
backup_time=$(date +%s)
assert_failure backup_postgresql
assert_failure check_postgresql_archive
assert_failure check_ready
curl_status=0
ready_body='{"status":"error"}'
assert_failure check_ready
ready_body='{"status":"error","checks":{"database":{"status":"ok"}}}'
assert_failure check_ready
docker_status=0
command touch "$POSTGRES_BACKUP_STAMP"
for archive_stats in '1201|0|100' '-1|0|0' '10|1|100' 'invalid'; do
  assert_failure check_postgresql_archive
done
archive_stats='10|0|100'
backup_time=1
assert_failure check_postgresql_archive
run_restic() { return 43; }
assert_failure backup_storage
assert_failure prune_storage
assert_failure initialize_storage_repository

ready_body='{"status":"ok"}'
: > "$STATE_DIRECTORY/pings"
run_monitored example no check_ready >/dev/null
[[ "$(cat "$STATE_DIRECTORY/pings")" == success ]]
echo "Operations failure propagation tests passed"
