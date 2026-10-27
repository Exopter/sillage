require "test_helper"
require "timeout"

class ExofdrIdentityConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  setup do
    @configuration = FdrFunctionalConfiguration.create!(version: 876_543, planned_capabilities: "Concurrent creation test")
  end

  teardown do
    @threads&.each { |thread| thread.join(5) || thread.kill }
    ids = Assembly.where(fdr_functional_configuration_id: @configuration.id).pluck(:id)
    FdrSystemMembership.where(system_assembly_id: ids).delete_all
    AssetIdentifier.where(identifiable_type: "Assembly", identifiable_id: ids).delete_all
    Assembly.where(id: ids).delete_all
    @configuration.destroy!
    IdentifierSequence.where(name: %w[EXOFDR-V876543-MAIN EXOFDR-V876543-SYSTEMS]).delete_all
  end

  test "simultaneous creations receive unique consecutive serials" do
    ready = Queue.new
    start = Queue.new
    configuration_id = @configuration.id
    @threads = 3.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          start.pop
          Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration_id: configuration_id, fdr_component_type: "MAIN").serial_number
        end
      end
    end
    Timeout.timeout(5) { 3.times { ready.pop } }
    3.times { start << true }
    serials = Timeout.timeout(5) { @threads.map(&:value) }
    assert_equal %w[EXOFDR-V876543-MAIN-01 EXOFDR-V876543-MAIN-02 EXOFDR-V876543-MAIN-03], serials.sort
  end

  test "catalogue edits cannot change a baseline while its first assembly is being committed" do
    issued = Queue.new
    release = Queue.new
    editing = Queue.new
    configuration_id = @configuration.id
    @threads = [ Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do
        Assembly.transaction do
          Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration_id: configuration_id, fdr_component_type: "MAIN")
          issued << true
          release.pop
        end
      end
    end ]
    Timeout.timeout(5) { issued.pop }
    @threads << Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do
        configuration = FdrFunctionalConfiguration.find(configuration_id)
        editing << true
        configuration.update(planned_capabilities: "Changed concurrently")
      end
    end
    Timeout.timeout(5) { editing.pop }
    release << true
    results = Timeout.timeout(5) { @threads.map(&:value) }
    assert_not results.last
    assert_equal "Concurrent creation test", @configuration.reload.planned_capabilities
  ensure
    release << true if release
  end

  test "simultaneous attachments keep one module per role and one matching history row" do
    system = Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration: @configuration, fdr_component_type: "SYSTEMS")
    modules = 2.times.map { Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration: @configuration, fdr_component_type: "MAIN") }
    ready = Queue.new
    start = Queue.new
    @threads = modules.map do |mod|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          candidate = Assembly.find(mod.id)
          ready << true
          start.pop
          candidate.update(parent_id: system.id)
        end
      end
    end
    Timeout.timeout(5) { 2.times { ready.pop } }
    2.times { start << true }
    results = Timeout.timeout(5) { @threads.map(&:value) }
    assert_equal [ false, true ], results.sort_by { |value| value ? 1 : 0 }
    assert_equal system.children.sole.id, system.system_memberships.active.sole.module_assembly_id
  end
end
