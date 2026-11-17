require "test_helper"
require "erb"
require "open3"
require "tmpdir"
require "yaml"

class DeployTest < ActiveSupport::TestCase
  BACKUP_ENV = %w[BACKUP_PLAN_URL R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BACKUP_BUCKET PGBACKREST_REPOSITORY_PASSWORD RESTIC_REPOSITORY_PASSWORD].index_with("test-value").freeze
  MONITOR_ENV = %w[MONITORING_PLAN_URL HEALTHCHECKS_READY_PING_URL].index_with("https://example.test/check").freeze
  TUNNEL_ENV = {
    "TUNNEL_MEDIA_URL" => "https://media.example.test/proflyer", "TUNNEL_MEDIA_LOGIN" => "pilot", "TUNNEL_MEDIA_PASSWORD" => "secret",
    "TUNNEL_MEDIA_LOCATION" => "Tunnel", "OBJECT_STORAGE_ENDPOINT" => "https://fsn1.example.test", "OBJECT_STORAGE_REGION" => "fsn1",
    "OBJECT_STORAGE_BUCKET" => "sillage-production", "OBJECT_STORAGE_ACCESS_KEY_ID" => "key", "OBJECT_STORAGE_SECRET_ACCESS_KEY" => "secret"
  }.freeze
  BACKUP_MONITOR_ENV = %w[HEALTHCHECKS_POSTGRESQL_ARCHIVE_PING_URL HEALTHCHECKS_POSTGRESQL_BACKUP_PING_URL HEALTHCHECKS_STORAGE_BACKUP_PING_URL].index_with("https://example.test/check").freeze

  test "all backup and monitoring flag combinations render independent operational surfaces" do
    [ false, true ].product([ false, true ]).each do |backup, monitor|
      env = { "BACKUPS_ENABLED" => backup.to_s, "MONITORING_ENABLED" => monitor.to_s }
      env.merge!(BACKUP_ENV) if backup
      env.merge!(MONITOR_ENV) if monitor
      env.merge!(BACKUP_MONITOR_ENV) if backup && monitor
      config = render_deploy(env)
      postgres = config.fetch("accessories").fetch("postgres")
      assert_includes postgres.fetch("cmd"), "archive_mode=#{backup ? 'on' : 'off'}"
      assert_equal backup, postgres.fetch("cmd").include?("archive_command=")
      assert_equal backup, postgres.fetch("env").fetch("secret").include?("PGBACKREST_REPO1_S3_KEY")
      assert_equal backup, postgres.fetch("env").fetch("clear").key?("PGBACKREST_REPO1_TYPE")
      assert_equal backup, postgres.key?("files")
    end
  end

  test "enabled backups and monitoring fail fast on missing required variables" do
    error = render_deploy({ "BACKUPS_ENABLED" => "true" }, success: false)
    assert_includes error, "BACKUPS_ENABLED=true requires BACKUP_PLAN_URL"
    error = render_deploy(BACKUP_ENV.merge(MONITOR_ENV).merge("BACKUPS_ENABLED" => "true", "MONITORING_ENABLED" => "true"), success: false)
    assert_includes error, "HEALTHCHECKS_POSTGRESQL_ARCHIVE_PING_URL"
  end

  test "the tunnel media sync is deployable only with its object storage bucket" do
    error = render_deploy({ "TUNNEL_MEDIA_URL" => "https://media.example.test/proflyer" }, success: false)
    assert_includes error, "TUNNEL_MEDIA_URL requires TUNNEL_MEDIA_LOGIN"
    assert_includes error, "OBJECT_STORAGE_BUCKET"

    config = render_deploy(TUNNEL_ENV)
    assert_equal "sillage-production", config.fetch("env").fetch("clear").fetch("OBJECT_STORAGE_BUCKET")
    assert_includes config.fetch("env").fetch("secret"), "OBJECT_STORAGE_SECRET_ACCESS_KEY"
    assert_not config.fetch("env").fetch("clear").key?("TUNNEL_MEDIA_PASSWORD")
  end

  test "a configured object storage bucket needs its backup signal once backups are monitored" do
    monitored = BACKUP_ENV.merge(MONITOR_ENV).merge(BACKUP_MONITOR_ENV).merge("BACKUPS_ENABLED" => "true", "MONITORING_ENABLED" => "true")
    error = render_deploy(monitored.merge(TUNNEL_ENV), success: false)
    assert_includes error, "HEALTHCHECKS_OBJECT_STORAGE_BACKUP_PING_URL"

    render_deploy(monitored.merge(TUNNEL_ENV).merge("HEALTHCHECKS_OBJECT_STORAGE_BACKUP_PING_URL" => "https://example.test/check"))
    render_deploy(monitored)
  end

  private

  def render_deploy(env, success: true)
    Dir.mktmpdir do |directory|
      FileUtils.mkdir_p(File.join(directory, "config"))
      FileUtils.cp(Rails.root.join("config/environment_file.rb"), File.join(directory, "config/environment_file.rb"))
      stdout, stderr, status = Open3.capture3(
        { "PATH" => ENV.fetch("PATH"), "POSTGRES_PASSWORD" => "test-password" }.merge(env),
        RbConfig.ruby, "-rerb", "-e", "puts ERB.new(File.read(ARGV.fetch(0))).result", Rails.root.join("config/deploy.yml").to_s,
        chdir: directory, unsetenv_others: true
      )
      assert_equal success, status.success?, stderr
      success ? YAML.safe_load(stdout) : stderr
    end
  end
end
