require "test_helper"

class OperationsFormLayoutTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:julien) }

  test "flight forms use the contextual column browser form" do
    [ new_flight_path, edit_flight_path(flights(:one)) ].each do |path|
      get path

      assert_response :success
      assert_select "turbo-frame#flight-browser .exds-browser-sidebar"
      assert_select "turbo-frame#flight-preview .exds-browser-editor > form.exds-browser-form", count: 1
      assert_select ".exds-browser-form-actions", count: 1
      assert_select ".operations-page", count: 0
    end
  end

  test "direct import uses the contextual column browser with the upload controls" do
    get new_flight_import_path

    assert_response :success
    assert_select "turbo-frame#flight-browser .exds-browser-sidebar"
    assert_select "turbo-frame#flight-preview .exds-browser-editor > form.operations-form", count: 1
    assert_select ".operations-page", count: 0
    assert_select ".import-source-picker", count: 1
    assert_select ".operations-form-actions.upload-actions", count: 1
  end

  test "all Hangar creation forms use the shared form page and panel" do
    [
      new_hangar_aircraft_path,
      new_hangar_assembly_path,
      new_hangar_part_path,
      new_hangar_function_path
    ].each do |path|
      get path

      assert_response :success
      assert_select ".workspace-form-page", count: 1
      assert_select ".workspace-panel.workspace-form-panel > form.workspace-form", count: 1
      assert_select ".workspace-form > .workspace-actions", count: 1
    end
  end

  test "aircraft installation controls use the shared form components" do
    function = Function.create!(name: "Installation form function")
    Part.create!(function:, model: "FlySight 2")
    Assembly.create!(name: "Flight data recorder")

    part = Part.find_by!(model: "FlySight 2")
    assembly = Assembly.find_by!(name: "Flight data recorder")
    busy = Part.create!(function:, model: "Busy part")
    Installation.create!(aircraft: aircraft(:pilatus), installable: busy, installed_at: 1.hour.ago)

    get hangar_aircraft_path(aircraft(:exowing))

    assert_response :success
    assert_select ".hangar-asset-head .hangar-picker form[action='#{hangar_aircraft_installations_path(aircraft(:exowing))}']" do
      assert_select "input[name='return_to'][value='#{hangar_aircraft_path(aircraft(:exowing))}']", count: 1
      assert_select "input[type='search']", count: 1
      assert_select "input[type='datetime-local'][name='installation[installed_at]']", count: 1
      assert_select "button[role='option']:not([disabled]) strong", text: part.display_name
      assert_select "button[role='option']:not([disabled]) strong", text: assembly.selection_label
      assert_select "button[role='option']:not([disabled])[data-kind='part']", text: /Busy part.*On #{aircraft(:pilatus).registration}.*Installing here moves it/m
      assert_select "button[data-equipment-picker-target='kind']", count: 3
      assert_select "input[type='submit'][value='Install'][disabled]", count: 1
    end
    assert_select "aside form.workspace-form", count: 0
  end

  test "equipment installs, is removed from its row and returns to the aircraft page" do
    function = Function.create!(name: "Row action function")
    part = Part.create!(function:, model: "Row part")
    exowing = aircraft(:exowing)

    post hangar_aircraft_installations_path(exowing), params: { return_to: hangar_aircraft_path(exowing), installation: { installable_type: "Part", installable_id: part.id, installed_at: "" } }
    assert_redirected_to hangar_aircraft_path(exowing)
    installation = exowing.installations.active.find_by!(installable: part)
    follow_redirect!
    assert_select ".hangar-tree-row form[action='#{hangar_installation_path(installation)}'] button", "Remove"

    delete hangar_installation_path(installation), params: { return_to: "https://example.org/hangar" }
    assert_redirected_to hangar_aircraft_path(exowing)
    assert_not installation.reload.active?
  end

  test "installing equipment that is elsewhere moves it" do
    function = Function.create!(name: "Moving function")
    part = Part.create!(function:, model: "Travelling part")
    nested = Part.create!(function:, model: "Nested part")
    holder = Assembly.create!(name: "Holder")
    nested.install_in!(holder)
    exowing, pilatus = aircraft(:exowing), aircraft(:pilatus)
    previous = Installation.create!(aircraft: pilatus, installable: part, installed_at: 1.hour.ago)

    post hangar_aircraft_installations_path(exowing), params: { installation: { installable_type: "Part", installable_id: part.id } }
    assert_redirected_to hangar_aircraft_path(exowing)
    assert_not previous.reload.active?
    assert_equal exowing, Installation.active.find_by!(installable: part).aircraft
    assert_equal "installed", part.reload.state

    post hangar_aircraft_installations_path(exowing), params: { installation: { installable_type: "Part", installable_id: nested.id } }
    assert_redirected_to hangar_aircraft_path(exowing)
    assert_nil nested.reload.assembly
    assert_predicate nested.part_installations.sole.removed_at, :present?
    assert_equal exowing, Installation.active.find_by!(installable: nested).aircraft

    get hangar_aircraft_path(exowing)
    assert_select ".hangar-fleet-select select[name='aircraft_id'] option[selected][value='#{exowing.id}']", count: 1
  end

  test "a part can be installed while it is registered" do
    function = Function.create!(name: "Registration function")
    holder = Assembly.create!(name: "Registration holder")
    get new_hangar_part_path
    assert_select "select[name='part[assembly_id]'] option", text: "Leave in stock"

    assert_difference "Part.count", 1 do
      post hangar_parts_path, params: { part: { function_id: function.id, model: "Fresh part", assembly_id: holder.id } }
    end
    part = Part.find_by!(model: "Fresh part")
    assert_redirected_to hangar_part_path(part)
    assert_equal holder, part.assembly

    assert_no_difference "Part.count" do
      post hangar_parts_path, params: { part: { function_id: function.id, model: "Lost part", assembly_id: 0 } }
    end
    assert_response :unprocessable_entity

    get hangar_assemblies_path(node: "part-#{part.id}")
    assert_select ".hangar-fold summary", text: /History.*1 installation/m
  end

  test "aircraft installation history identifies assets without exposing database ids" do
    function = Function.create!(name: "Installation history function")
    part = Part.create!(function:, manufacturer: "Bionic Avionics", model: "FlySight 2")
    Installation.create!(
      aircraft: aircraft(:exowing),
      installable: part,
      installed_at: 1.hour.ago,
      removed_at: 30.minutes.ago
    )

    get hangar_aircraft_path(aircraft(:exowing))

    assert_response :success
    assert_select ".workspace-panel", text: /Installation history/ do
      assert_select "strong", text: "#{part.internal_number} · #{part.display_name}", count: 1
      assert_select "small", text: /Part ·/, count: 1
      assert_select "strong", text: "Part · #{part.id}", count: 0
    end
  end
end
