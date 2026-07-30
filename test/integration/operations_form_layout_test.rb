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
end
