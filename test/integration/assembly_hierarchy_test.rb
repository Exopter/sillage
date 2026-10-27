require "test_helper"

class AssemblyHierarchyTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as_admin users(:operator)
    configuration = create_fdr_functional_configuration(version: 2)
    @system = Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration: configuration, fdr_component_type: "SYSTEMS")
    @main = Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration: configuration, fdr_component_type: "MAIN", parent: @system)
    @lite = Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration: configuration, fdr_component_type: "LITE")
    function = Function.create!(code: "TREE_SENSOR", name: "Tree sensor")
    @part = Part.create!(function:, manufacturer: "Inventory", model: "Nested sensor", serial_number: "TREE-001")
    @part.install_in!(@main)
    Installation.create!(installable: @system, aircraft: aircraft(:pilatus), installed_at: Time.current)
  end

  test "renders each assembly once under its actual parent with nested parts and inherited aircraft" do
    get hangar_assemblies_path
    assert_response :success
    assert_select "[data-key='assembly-#{@system.id}'][data-kind='system']", count: 1 do
      assert_select "[data-key='assembly-#{@main.id}'][data-kind='assembly']", count: 1 do
        assert_select "[data-key='part-#{@part.id}'][data-kind='part']", count: 1
        assert_select ".exds-hierarchy-location", text: /#{aircraft(:pilatus).registration}/, count: 2
      end
    end
    assert_select "section[aria-label='Standalone'] [data-key='assembly-#{@lite.id}'][data-kind='assembly']", count: 1
    assert_select "section[aria-label='Standalone'] [data-key='assembly-#{@main.id}']", count: 0
    assert_select "turbo-frame#assembly-details", count: 1
    assert_select "[data-assembly-hierarchy-selected-value='']", count: 1
    assert_select ".exds-hierarchy-row.is-selected", count: 0
    assert_select ".exds-hierarchy-select[aria-current]", count: 0
    assert_select "#assembly-details .workspace-empty", "Select an assembly or part to view its details."
  end

  test "part detail request retains ancestry and returns only its Turbo frame" do
    get hangar_assemblies_path(node: "part-#{@part.id}"), headers: { "Turbo-Frame" => "assembly-details" }
    assert_response :success
    assert_select "turbo-frame#assembly-details", count: 1
    assert_select "[data-controller='assembly-hierarchy']", count: 0
    assert_select ".exds-hierarchy-path a", count: 2
    assert_select "h3", @part.display_name
    assert_select "dd", text: /#{aircraft(:pilatus).registration}/
    assert_select "a[href='#{hangar_part_path(@part)}'][data-turbo-frame='_top']", text: "Open full record"
  end

  test "system detail counts nested parts without treating composition as serviceability" do
    get hangar_assemblies_path(node: "assembly-#{@system.id}")
    assert_select ".exds-hierarchy-overview strong", text: "1 / 4"
    assert_select ".exds-hierarchy-overview strong", text: "1"
    assert_select ".exds-hierarchy-roles .is-missing", count: 3
    assert_select "dd", text: "In preparation"
    assert_select "#assembly-details a", text: "Open in Forge", count: 0
  end

  test "retired assemblies remain excluded by default and can be selected through the state filter" do
    @lite.update!(serviceability_state: "retired")
    get hangar_assemblies_path
    assert_select "[data-key='assembly-#{@lite.id}']", count: 0
    get hangar_assemblies_path(state: "retired", node: "assembly-#{@lite.id}")
    assert_select "h3", @lite.serial_number
    assert_select "a[href='#{hangar_assemblies_path(node: "assembly-#{@lite.id}", state: "retired")}']"
    assert_select "#assembly-details a", text: "Open in Forge", count: 0
  end

  test "regular read-only accounts cannot access the hierarchy or its detail frames" do
    users(:operator).update!(role: "user")
    get hangar_assemblies_path
    assert_response :forbidden
    get hangar_assemblies_path(node: "part-#{@part.id}"), headers: { "Turbo-Frame" => "assembly-details" }
    assert_response :forbidden
  end

  test "inventory traversal does not query once for every node" do
    inventory = Hangar::AssemblyInventory.new
    queries = []
    callback = ->(_name, _start, _finish, _id, payload) { queries << payload[:sql] unless payload[:name] == "SCHEMA" }
    ActiveSupport::Notifications.subscribed(callback, "sql.active_record") do
      inventory.nodes.each_value { |node| inventory.aircraft(node); inventory.part_count(node); inventory.ancestors(node) }
    end
    assert_empty queries
  end
end
