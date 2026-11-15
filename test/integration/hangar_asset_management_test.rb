require "test_helper"

class HangarAssetManagementTest < ActionDispatch::IntegrationTest
  setup do
    @function = Function.create!(code: "DELETE_FLOW", name: "Delete flow")
    @assembly = Assembly.create!(name: "Editable assembly")
    @part = Part.create!(function: @function, model: "Editable part")
    @aircraft = Aircraft.create!(registration: "F-EDIT", name: "Editable aircraft")

    sign_in_as_admin users(:operator)
  end

  test "assembly update and cancel stay in Hangar for an ExoFDR" do
    recorder = create_exofdr_assembly
    create_embedded_controller(assembly: recorder, device_id: "ECU-A172E0")
    get edit_hangar_assembly_path(recorder)
    assert_response :success
    assert_select "a[href='#{hangar_assembly_path(recorder)}']", text: "Cancel"
    get hangar_assembly_path(recorder)
    assert_response :success
    assert_select ".hangar-tabs"

    patch hangar_assembly_path(recorder), params: { assembly: { notes: "Updated from Hangar" } }
    assert_redirected_to hangar_assembly_path(recorder)
    follow_redirect!
    assert_response :success
    assert_equal hangar_assembly_path(recorder), path
    assert_select ".hangar-tabs"
    assert_select ".workspace-header h2", recorder.display_name
    assert_equal "Updated from Hangar", recorder.reload.notes
    assert_select "main", text: /Updated from Hangar/
    assert_select "a[href='#{forge_fdr_path(recorder.serial_number)}']", text: "Open in Forge"
    assert_select ".exds-recorder-workspace", count: 0
  end

  test "integrated controller parts stay in Hangar when opened edited and updated" do
    recorder = create_exofdr_assembly
    controller = create_embedded_controller(assembly: recorder, device_id: "ECU-A172E0")
    part = controller.part
    get hangar_part_path(part)
    assert_response :success
    assert_select "a[href='#{edit_hangar_part_path(part)}']", text: "Edit"
    assert_select "a[href='#{forge_fdr_path(recorder.serial_number)}']", text: "Open in Forge"
    get edit_hangar_part_path(part)
    assert_response :success
    assert_select "a[href='#{hangar_part_path(part)}']", text: "Cancel"
    patch hangar_part_path(part), params: { part: { notes: "Updated controller inventory" } }
    assert_redirected_to hangar_part_path(part)
    follow_redirect!
    assert_response :success
    assert_equal hangar_part_path(part), path
    assert_select ".hangar-tabs"
    assert_equal "Updated controller inventory", part.reload.notes
    assert_select "main", text: /Updated controller inventory/
  end

  test "retired assemblies can be reactivated from the enabled state selector" do
    recorder = create_exofdr_assembly
    controller = create_embedded_controller(assembly: recorder, device_id: "ECU-A172E0")
    detached = Part.create!(function: @function, model: "Detached part")
    detached.install_in!(recorder)
    recorder.update!(serviceability_state: "retired")
    detached.remove_from_assembly!
    installation = controller.part.active_part_installation

    get edit_hangar_assembly_path(recorder)
    assert_response :success
    assert_select "select[name='assembly[serviceability_state]']:not([disabled]) option[selected][value='retired']"

    patch hangar_assembly_path(recorder), params: { assembly: { serviceability_state: "in_preparation" } }
    assert_redirected_to hangar_assembly_path(recorder)
    assert_equal "in_preparation", recorder.reload.serviceability_state
    assert_equal "installed", controller.part.reload.state
    assert_equal installation, controller.part.active_part_installation
    assert_nil installation.reload.removed_at
    assert_equal "retired", detached.reload.state

    get forge_fdr_path(recorder.serial_number)
    assert_response :success
    get hangar_assemblies_path
    assert_select ".exds-hierarchy-copy strong", text: recorder.display_name

    %w[quarantined serviceable].each do |state|
      recorder.update!(serviceability_state: "retired")
      patch hangar_assembly_path(recorder), params: { assembly: { serviceability_state: state } }
      assert_redirected_to hangar_assembly_path(recorder)
      assert_equal state, recorder.reload.serviceability_state
      assert_equal "installed", controller.part.reload.state
    end
  end

  test "retired standalone parts can be reactivated by an administrator" do
    sign_in_as users(:julien)
    @part.update!(state: "retired")
    get edit_hangar_part_path(@part)
    assert_select "select[name='part[state]']:not([disabled]) option[selected][value='retired']"
    patch hangar_part_path(@part), params: { part: { state: "available" } }
    assert_redirected_to hangar_part_path(@part)
    assert_equal "available", @part.reload.state
  end

  test "a mounted part cannot be reactivated independently of its retired assembly" do
    @part.install_in!(@assembly)
    @assembly.update!(serviceability_state: "retired")
    assert_not @part.reload.update(state: "available")
    assert_includes @part.errors[:state], "must remain retired while its assembly is retired; reactivate the assembly first"
    assert_equal "retired", @part.reload.state
  end

  test "retiring an assembly retires mounted parts and preserves installation history" do
    @part.install_in!(@assembly)
    removed = Part.create!(function: @function, model: "Removed part")
    removed.install_in!(@assembly)
    removed.remove_from_assembly!

    patch hangar_assembly_path(@assembly), params: { assembly: { serviceability_state: "retired" } }

    assert_redirected_to hangar_assembly_path(@assembly)
    assert_equal "retired", @assembly.reload.serviceability_state
    assert_equal "retired", @part.reload.state
    assert_equal @assembly, @part.assembly
    assert_equal 1, @part.part_installations.active.count
    assert_equal "available", removed.reload.state
    @part.remove_from_assembly!
    assert_equal "retired", @part.reload.state
  end

  test "retired assets are hidden by default and accessible through filters" do
    @assembly.update!(serviceability_state: "retired")
    @part.update!(state: "retired")

    get hangar_assemblies_path
    assert_select "[data-key='assembly-#{@assembly.id}']", count: 0
    get hangar_assemblies_path(state: "retired")
    assert_select ".exds-hierarchy-copy strong", text: @assembly.display_name
    get hangar_assemblies_path(state: "all")
    assert_select ".exds-hierarchy-copy strong", text: @assembly.display_name

    get hangar_parts_path
    assert_select "a[href='#{hangar_part_path(@part)}']", count: 0
    get hangar_parts_path(state: "retired")
    assert_select "a[href='#{hangar_part_path(@part)}']", text: @part.display_name
    get hangar_parts_path(state: "all")
    assert_select "a[href='#{hangar_part_path(@part)}']", text: @part.display_name
  end

  test "IMU mounting is limited to ExoFDR assemblies" do
    get new_hangar_assembly_path
    assert_select "fieldset[data-assembly-form-target='mounting'][hidden][disabled] select[name='assembly[imu_mount_profile]']"
    get edit_hangar_assembly_path(@assembly)
    assert_select "select[name='assembly[imu_mount_profile]']", count: 0
    get hangar_assembly_path(@assembly)
    assert_select "dt", text: "IMU mounting", count: 0

    recorder = Assembly.create!(assembly_type: "ExoFDR", assembly_method: "PERF", fdr_functional_configuration: create_fdr_functional_configuration)
    get edit_hangar_assembly_path(recorder)
    assert_select "fieldset[data-assembly-form-target='mounting']:not([hidden]):not([disabled]) select[name='assembly[imu_mount_profile]']"
  end

  test "edit and delete actions are visible from Hangar asset views" do
    get hangar_assemblies_path(assembly_id: @assembly.id)

    assert_response :success
    assert_select "a[href='#{edit_hangar_assembly_path(@assembly)}']", count: 0
    assert_select "a[href='#{hangar_assembly_path(@assembly)}']", text: "Open full record"
    assert_select "form[action='#{hangar_assembly_path(@assembly)}']", count: 0

    get hangar_assembly_path(@assembly)
    assert_select "a[href='#{edit_hangar_assembly_path(@assembly)}']", text: "Edit"
    assert_assembly_sensitive_zone(@assembly)

    recorder = create_exofdr_assembly
    get hangar_assembly_path(recorder)
    assert_assembly_sensitive_zone(recorder)

    get hangar_parts_path

    assert_response :success
    assert_select "a[href='#{edit_hangar_part_path(@part)}']", text: "Edit"
    assert_select "form[action='#{hangar_part_path(@part)}'] input[name='_method'][value='delete']", count: 0

    get hangar_part_path(@part)
    assert_response :success
    assert_select "header.workspace-header input[name='_method'][value='delete']", count: 0
    assert_select "section:last-child.danger-panel" do
      assert_select "h2", "Sensitive zone"
      assert_select "p", text: /retirement preserves.*traceability/
      assert_select "form[action='#{hangar_part_path(@part)}']" do
        assert_select "input[name='_method'][value='delete']", count: 1
        assert_select "button", "Delete part"
      end
    end

    get hangar_aircraft_index_path(aircraft_id: @aircraft.id)

    assert_response :success
    assert_select "a[href='#{edit_hangar_aircraft_path(@aircraft)}']", text: "Edit"
    assert_delete_form hangar_aircraft_path(@aircraft)
  end

  test "generic assemblies keep their generic identity in Hangar" do
    get hangar_assemblies_path(assembly_id: @assembly.id)

    assert_response :success
    assert_select ".hangar-details-body h3", @assembly.name
    assert_select ".hangar-details-body", text: /Internal Asset ID.*#{@assembly.internal_number}/m
    assert_select ".hangar-details-body", text: /S\/N not assigned/, count: 0
    assert_select ".hangar-details-body", text: /Hardware definition/, count: 0
    assert_select ".hangar-details-body", text: /Qualification/, count: 0
    assert_select ".hangar-details-body", text: /ECU ID/, count: 0
  end

  test "unused assets can be deleted" do
    assert_difference -> { Assembly.count }, -1 do
      delete hangar_assembly_path(@assembly)
    end
    assert_redirected_to hangar_assemblies_path

    assert_difference -> { Part.count }, -1 do
      delete hangar_part_path(@part)
    end
    assert_redirected_to hangar_parts_path

    assert_difference -> { Aircraft.count }, -1 do
      delete hangar_aircraft_path(@aircraft)
    end
    assert_redirected_to hangar_aircraft_index_path
  end

  test "unused ExoFDR assemblies can be deleted while their issued identifiers stay reserved" do
    recorder = create_exofdr_assembly
    number = recorder.internal_number
    serial = recorder.serial_number
    identifier = recorder.asset_identifier

    assert_difference -> { Assembly.count }, -1 do
      delete hangar_assembly_path(recorder)
    end
    assert_redirected_to hangar_assemblies_path
    assert_equal "Assembly deleted.", flash[:notice]
    assert AssetIdentifier.exists?(identifier.id)

    replacement = create_exofdr_assembly
    assert_not_equal number, replacement.internal_number
    assert_not_equal serial, replacement.serial_number
  end

  test "an ExoFDR with a removed board keeps its identity and history" do
    recorder = create_exofdr_assembly
    board = create_embedded_controller(device_id: "ECU-112233445566")
    binding = FdrBoardInstallation.create!(assembly: recorder, embedded_controller: board, installed_at: 1.hour.ago)
    binding.update!(removed_at: Time.current)

    assert_no_difference -> { Assembly.count } do
      delete hangar_assembly_path(recorder)
    end
    assert_redirected_to hangar_assembly_path(recorder)
    assert_match(/board installation history/, flash[:alert])
    assert_not recorder.reload.destroy
    assert FdrBoardInstallation.exists?(binding.id)
  end

  test "detached FDR modules and systems retain their membership history" do
    configuration = create_fdr_functional_configuration(version: 2)
    system = create_exofdr_assembly(fdr_functional_configuration: configuration, fdr_component_type: "SYSTEMS", assembly_method: nil)
    mod = create_exofdr_assembly(fdr_functional_configuration: configuration, fdr_component_type: "MAIN", assembly_method: "PCB", parent: system)
    mod.update!(parent: nil)

    [ mod, system ].each do |assembly|
      assert_no_difference -> { Assembly.count } do
        delete hangar_assembly_path(assembly)
      end
      assert_redirected_to hangar_assembly_path(assembly)
      assert_match(/system membership history/, flash[:alert])
      assert_not assembly.reload.destroy
    end
  end

  test "a nested generic assembly must be detached before deletion" do
    child = Assembly.create!(name: "Nested assembly", parent: @assembly)

    assert_no_difference -> { Assembly.count } do
      delete hangar_assembly_path(child)
    end
    assert_redirected_to hangar_assembly_path(child)
    assert_match(/a parent assembly/, flash[:alert])
    assert_not child.reload.destroy

    child.update!(parent: nil)
    assert_difference -> { Assembly.count }, -1 do
      delete hangar_assembly_path(child)
    end
  end

  test "an ExoFDR selected for a flight cannot be deleted" do
    recorder = create_exofdr_assembly
    flights(:one).update!(fdr: recorder)

    assert_no_difference -> { Assembly.count } do
      delete hangar_assembly_path(recorder)
    end
    assert_redirected_to hangar_assembly_path(recorder)
    assert_match(/flight history/, flash[:alert])
    assert_not recorder.reload.destroy
    assert_equal recorder, flights(:one).reload.fdr
  end

  test "referenced assets are retained with an actionable explanation" do
    installed_part = create_installed_part(assembly: @assembly, function: @function, model: "Installed part")
    installation = Installation.create!(aircraft: @aircraft, installable: @assembly, installed_at: Time.current)

    assert_no_difference -> { Assembly.count } do
      delete hangar_assembly_path(@assembly)
    end
    assert_redirected_to hangar_assembly_path(@assembly)
    assert_match(/part installation history and installation history/, flash[:alert])

    assert_no_difference -> { Part.count } do
      delete hangar_part_path(installed_part)
    end
    assert_redirected_to hangar_part_path(installed_part)
    assert_match(/assembly installation history/, flash[:alert])

    assert_no_difference -> { Aircraft.count } do
      delete hangar_aircraft_path(@aircraft)
    end
    assert_redirected_to hangar_aircraft_path(@aircraft)
    assert_match(/installation history/, flash[:alert])

    assert installation.persisted?
  end

  private

  def assert_assembly_sensitive_zone(assembly)
    assert_select "header.workspace-header input[name='_method'][value='delete']", count: 0
    assert_select "section:last-child.danger-panel" do
      assert_select "h2", "Sensitive zone"
      assert_select "p", text: /retirement preserves.*traceability/
      confirmation = "Delete #{assembly.display_name} (#{assembly.internal_number}) permanently? This cannot be undone. Retire the assembly instead to preserve traceability."
      assert_select "form[action='#{hangar_assembly_path(assembly)}'][data-turbo-confirm=?]", confirmation do
        assert_select "input[name='_method'][value='delete']", count: 1
        assert_select "button", "Delete assembly"
      end
    end
  end

  def assert_delete_form(path)
    assert_select "form[action='#{path}']" do
      assert_select "input[name='_method'][value='delete']", count: 1
      assert_select "button", text: "Delete"
    end
  end
end
