require "test_helper"

class OperationsFormLayoutTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:julien) }

  test "flight and Atlas forms use the constrained shared form shell" do
    [ new_flight_path, edit_flight_path(flights(:one)), new_landing_zone_path ].each do |path|
      get path

      assert_response :success
      assert_select ".operations-page.is-narrow"
      assert_select ".operations-panel.operations-form-panel > form.operations-form", count: 1
      assert_select ".operations-form-actions", count: 1
    end
  end

  test "direct import uses the same constrained form shell" do
    get new_flight_import_path

    assert_response :success
    assert_select ".operations-page.is-narrow"
    assert_select ".operations-panel.operations-form-panel > form.operations-form", count: 1
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

    get hangar_aircraft_path(aircraft(:exowing))

    assert_response :success
    assert_select "aside form.workspace-form", count: 2
    assert_select "aside form.workspace-inline-form", count: 0
    assert_select "label", text: /Assembly/
    assert_select "label", text: /Part/
    assert_select "label", text: /Installed at/, count: 2
    assert_select "input[type='datetime-local']", count: 2
    assert_select ".workspace-form > .workspace-actions", count: 2
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
