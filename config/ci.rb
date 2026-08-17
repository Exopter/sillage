# Run using bin/ci

CI.run do
  step "Setup", "bin/setup --skip-server"

  step "Style: Ruby", "bin/rubocop"
  step "Style: Canonical design-system tokens", "ruby script/sync_design_system_tokens --check"
  step "Style: Design system contract", "ruby script/check_design_system_contract"
  step "Style: No unused CSS selectors", "ruby script/check_unused_css_selectors"
  step "Style: Documentation boundary", "ruby script/check_documentation_boundary"
  step "Tests: Cesium ion tile provider", "node test/javascript/flight_viewer_cesium_ion_test.mjs"
  step "Tests: FDR synchronization protocol", "node test/javascript/fdr_sync_protocol_test.mjs"
  step "Tests: Aircraft connection identity", "node test/javascript/aircraft_connection_test.mjs"
  step "Tests: Signal worker", "node test/javascript/signal_serial_worker_test.mjs"

  step "Security: Gem audit", "bin/bundler-audit"
  step "Security: Importmap vulnerability audit", "bin/importmap audit"
  step "Security: Brakeman code analysis", "bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error"
  step "Tests: Rails", "bin/rails test"
  step "Tests: Seeds", "env RAILS_ENV=test bin/rails db:seed:replant"

  # Optional: set a green GitHub commit status to unblock PR merge.
  # Requires the `gh` CLI and `gh extension install basecamp/gh-signoff`.
  # if success?
  #   step "Signoff: All systems go. Ready for merge and deploy.", "gh signoff"
  # else
  #   failure "Signoff: CI failed. Do not merge or deploy.", "Fix the issues and try again."
  # end
end
