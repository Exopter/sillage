require "test_helper"

class PartAssemblyAssignmentTest < ActionDispatch::IntegrationTest
  setup do
    @function = Function.create!(code: "ASSIGNMENT_TEST", name: "Assignment test")
    @original = Assembly.create!(name: "Original assembly")
    @replacement = create_exofdr_assembly
    @retired = Assembly.create!(name: "Retired assembly", serviceability_state: "retired")
    @part = Part.create!(function: @function, model: "Test sensor", notes: "Original notes")
    @part.install_in!(@original, at: 1.day.ago)
    @installation = @part.active_part_installation
    sign_in_as users(:operator)
  end

  test "edit preselects the current assembly and offers active assembly identities" do
    get edit_hangar_part_path(@part)

    assert_response :success
    assert_select "select[name='part[assembly_id]']" do
      assert_select "option[selected][value='#{@original.id}']", text: @original.selection_label
      assert_select "option[value='#{@replacement.id}']", text: @replacement.serial_number
      assert_select "option[value='#{@retired.id}']", count: 0
      assert_select "option[value='']", text: "Not installed in an assembly"
    end
  end

  test "operator reassigns a part and edits its metadata without rewriting installation history" do
    @installation.update!(notes: "Initial installation", installed_at_estimated: true)
    installed_at = @installation.installed_at

    freeze_time do
      assert_difference -> { @part.part_installations.count }, 1 do
        patch hangar_part_path(@part), params: { part: { assembly_id: @replacement.id, notes: "Moved sensor" } }
      end

      assert_redirected_to hangar_part_path(@part)
      assert_equal @replacement, @part.reload.assembly
      assert_equal "installed", @part.state
      assert_equal "Moved sensor", @part.notes
      assert_equal Time.current, @installation.reload.removed_at
      assert_equal installed_at, @installation.installed_at
      assert_equal "Initial installation", @installation.notes
      assert @installation.installed_at_estimated?
      assert_equal Time.current, @part.active_part_installation.installed_at
      assert_not @part.active_part_installation.installed_at_estimated?
      assert_equal @original, @part.assembly_at(Time.current - 1.second)
      assert_equal @replacement, @part.assembly_at(Time.current)
      assert_equal 1, @part.part_installations.active.count
      assert_not @original.reload.parts.exists?(@part.id)
      assert @replacement.reload.parts.exists?(@part.id)
    end

    follow_redirect!
    assert_select "a[href='#{hangar_assembly_path(@replacement)}']", text: @replacement.identity_label
    assert_select ".workspace-list-row strong", text: @original.selection_label
    assert_select ".workspace-list-row strong", text: @replacement.selection_label
  end

  test "saving the same assembly or omitting the field does not create an installation" do
    [ { assembly_id: @original.id }, {} ].each do |assignment|
      assert_no_difference -> { PartInstallation.count } do
        patch hangar_part_path(@part), params: { part: assignment.merge(model: "Updated sensor") }
      end

      assert_redirected_to hangar_part_path(@part)
      assert_equal @installation, @part.reload.active_part_installation
      assert_nil @installation.reload.removed_at
      assert_equal "Updated sensor", @part.model
    end
  end

  test "a current retired assembly remains selected until the part is explicitly moved" do
    @original.update!(serviceability_state: "retired")

    get edit_hangar_part_path(@part)

    assert_response :success
    assert_select "select[name='part[assembly_id]'] option[selected][value='#{@original.id}']"

    assert_no_difference -> { PartInstallation.count } do
      patch hangar_part_path(@part), params: { part: { assembly_id: @original.id, notes: "Updated notes" } }
    end

    assert_redirected_to hangar_part_path(@part)
    assert_original_installation
    assert_equal "Updated notes", @part.notes
  end

  test "clearing the assembly removes the part and allows a later installation" do
    assert_no_difference -> { PartInstallation.count } do
      patch hangar_part_path(@part), params: { part: { assembly_id: "" } }
    end

    assert_redirected_to hangar_part_path(@part)
    assert_nil @part.reload.assembly
    assert_equal "available", @part.state
    assert_not_nil @installation.reload.removed_at

    assert_difference -> { PartInstallation.count }, 1 do
      patch hangar_part_path(@part), params: { part: { assembly_id: @replacement.id } }
    end

    assert_redirected_to hangar_part_path(@part)
    assert_equal @replacement, @part.reload.assembly
    assert_equal "installed", @part.state
  end

  test "invalid metadata rolls back the assignment and keeps the submitted values" do
    assert_no_difference -> { PartInstallation.count } do
      patch hangar_part_path(@part), params: { part: { assembly_id: @replacement.id, model: "", notes: "Unsaved notes" } }
    end

    assert_response :unprocessable_entity
    assert_select ".workspace-errors", text: /Model can't be blank/
    assert_select "option[selected][value='#{@replacement.id}']"
    assert_select "input[name='part[model]'][value='']"
    assert_select "textarea[name='part[notes]']", text: "Unsaved notes"
    assert_original_installation
    assert_equal "Test sensor", @part.model
    assert_equal "Original notes", @part.notes
  end

  test "retired or missing target assemblies leave the original installation and metadata intact" do
    [ @retired.id, Assembly.maximum(:id) + 1 ].each do |assembly_id|
      assert_no_difference -> { PartInstallation.count } do
        patch hangar_part_path(@part), params: { part: { assembly_id:, notes: "Unsaved notes" } }
      end

      assert_response :unprocessable_entity
      assert_select ".workspace-errors", text: /Assembly/
      assert_original_installation
      assert_equal "Original notes", @part.notes
    end
  end

  test "a part installed directly on an aircraft cannot be assigned to an assembly" do
    part = Part.create!(function: @function, model: "Aircraft sensor")
    installation = Installation.create!(aircraft: aircraft(:exowing), installable: part, installed_at: 1.hour.ago)

    assert_no_difference -> { PartInstallation.count } do
      patch hangar_part_path(part), params: { part: { assembly_id: @replacement.id } }
    end

    assert_response :unprocessable_entity
    assert_select ".workspace-errors", text: /outside another assembly or aircraft/
    assert_nil part.reload.assembly
    assert_equal "installed", part.state
    assert installation.reload.active?
  end

  test "quarantined and retired parts cannot be installed by an operator" do
    %w[quarantined retired].each do |state|
      part = Part.create!(function: @function, model: "Unserviceable sensor", state:)

      assert_no_difference -> { PartInstallation.count } do
        patch hangar_part_path(part), params: { part: { assembly_id: @replacement.id, state: "available" } }
      end

      assert_response :unprocessable_entity
      assert_nil part.reload.assembly
      assert_equal state, part.state
    end
  end

  test "an admin can restore serviceability and install an available part in one update" do
    sign_in_as users(:julien)
    part = Part.create!(function: @function, model: "Quarantined sensor", state: "quarantined")

    patch hangar_part_path(part), params: { part: { assembly_id: @replacement.id, state: "available" } }

    assert_redirected_to hangar_part_path(part)
    assert_equal @replacement, part.reload.assembly
    assert_equal "installed", part.state
  end

  private

  def assert_original_installation
    assert_equal @original, @part.reload.assembly
    assert_equal "installed", @part.state
    assert_equal @installation, @part.active_part_installation
    assert_nil @installation.reload.removed_at
  end
end
