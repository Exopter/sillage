#!/usr/bin/env ruby
# frozen_string_literal: true

require_relative "migrator"

required = %w[SOURCE_SQLITE_PATH TARGET_DATABASE_URL MIGRATION_MANIFEST_PATH MIGRATION_CONFIRM]
missing = required.select { |name| ENV[name].to_s.empty? }
abort "Missing required environment variables: #{missing.join(', ')}" if missing.any?

SqliteToPostgresql::Migrator.new(
  source_path: ENV.fetch("SOURCE_SQLITE_PATH"),
  target_url: ENV.fetch("TARGET_DATABASE_URL"),
  manifest_path: ENV.fetch("MIGRATION_MANIFEST_PATH"),
  confirmation: ENV.fetch("MIGRATION_CONFIRM")
).run!
