# frozen_string_literal: true

require "json"
require "digest"
require "minitest/autorun"
require "open3"
require "pathname"
require "rbconfig"
require "tmpdir"

class CleanupTest < Minitest::Test
  SCRIPT = File.expand_path("../../remove_sqlite_after_postgresql_restore", __dir__)
  CONFIRMATION = "DELETE_ALL_VERIFIED_SQLITE_ARTIFACTS"

  def test_refuses_verification_from_the_live_database
    Dir.mktmpdir do |directory|
      storage = prepare_storage(directory)
      database = storage.join("production.sqlite3")
      database.write("sqlite")
      verification = write_verification(
        directory,
        source_database: "sillage_production",
        database: "sillage_production"
      )

      _output, error, status = run_cleanup(storage:, verification:)

      refute status.success?
      assert_includes error, "separate restored database"
      assert database.exist?
    end
  end

  def test_refuses_unexpected_sqlite_artifacts
    Dir.mktmpdir do |directory|
      storage = prepare_storage(directory)
      expected = storage.join("production.sqlite3")
      unexpected = storage.join("production.sqlite3.backup")
      expected.write("sqlite")
      unexpected.write("sqlite")
      snapshot = write_snapshot(directory)
      verification = write_verification(directory, snapshot:)

      _output, error, status = run_cleanup(storage:, verification:, snapshot:)

      refute status.success?
      assert_includes error, "Unexpected SQLite artifacts"
      assert expected.exist?
      assert unexpected.exist?
    end
  end

  def test_deletes_only_expected_artifacts_after_a_separate_restore_was_verified
    Dir.mktmpdir do |directory|
      storage = prepare_storage(directory)
      database = storage.join("production.sqlite3")
      sidecar = storage.join("production.sqlite3-wal")
      [ database, sidecar ].each { |path| path.write("sqlite") }
      snapshot = write_snapshot(directory)
      verification = write_verification(directory, snapshot:)

      output, error, status = run_cleanup(storage:, verification:, snapshot:)

      assert status.success?, error
      assert_includes output, "Deleted #{database}"
      refute database.exist?
      refute sidecar.exist?
      refute snapshot.exist?
    end
  end

  private

  def prepare_storage(directory)
    Pathname(directory).join("storage").tap(&:mkdir)
  end

  def write_snapshot(directory)
    Pathname(directory).join("closed-snapshot.sqlite-copy").tap { |path| path.write("snapshot") }
  end

  def write_verification(
    directory,
    snapshot: nil,
    source_database: "sillage_production",
    database: "sillage_restore_verification"
  )
    Pathname(directory).join("postgresql-restore-verified.json").tap do |path|
      path.write(JSON.generate(
        verified: true,
        source_database:,
        database:,
        manifest_sha256: "a" * 64,
        source_sqlite_sha256: snapshot ? Digest::SHA256.file(snapshot).hexdigest : "b" * 64
      ))
    end
  end

  def run_cleanup(storage:, verification:, snapshot: nil)
    environment = {
      "SQLITE_CLEANUP_CONFIRM" => CONFIRMATION,
      "POSTGRESQL_RESTORE_VERIFICATION" => verification.to_s,
      "SQLITE_STORAGE_ROOT" => storage.to_s
    }
    environment["SQLITE_SNAPSHOT_PATH"] = snapshot.to_s if snapshot

    Open3.capture3(environment, RbConfig.ruby, SCRIPT)
  end
end
