require "test_helper"

class HangarAssetManagementTest < ActionDispatch::IntegrationTest
  setup do
    @function = Function.create!(code: "DELETE_FLOW", name: "Delete flow")
    @assembly = Assembly.create!(name: "Editable assembly")
    @part = Part.create!(function: @function, model: "Editable part")
    @aircraft = Aircraft.create!(registration: "F-EDIT", name: "Editable aircraft")

    sign_in_as users(:operator)
  end

  test "edit and delete actions are visible from Hangar asset views" do
    get hangar_assemblies_path(assembly_id: @assembly.id)

    assert_response :success
    assert_select "a[href='#{edit_hangar_assembly_path(@assembly)}']", text: "Edit"
    assert_delete_form hangar_assembly_path(@assembly)

    get hangar_parts_path

    assert_response :success
    assert_select "a[href='#{edit_hangar_part_path(@part)}']", text: "Edit"
    assert_delete_form hangar_part_path(@part)

    get hangar_aircraft_index_path(aircraft_id: @aircraft.id)

    assert_response :success
    assert_select "a[href='#{edit_hangar_aircraft_path(@aircraft)}']", text: "Edit"
    assert_delete_form hangar_aircraft_path(@aircraft)
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

  test "referenced assets are retained with an actionable explanation" do
    installed_part = Part.create!(function: @function, model: "Installed part", assembly: @assembly)
    installation = Installation.create!(aircraft: @aircraft, installable: @assembly, installed_at: Time.current)

    assert_no_difference -> { Assembly.count } do
      delete hangar_assembly_path(@assembly)
    end
    assert_redirected_to hangar_assembly_path(@assembly)
    assert_match(/installed parts and installation history/, flash[:alert])

    assert_no_difference -> { Part.count } do
      delete hangar_part_path(installed_part)
    end
    assert_redirected_to hangar_part_path(installed_part)
    assert_match(/an assembly assignment/, flash[:alert])

    assert_no_difference -> { Aircraft.count } do
      delete hangar_aircraft_path(@aircraft)
    end
    assert_redirected_to hangar_aircraft_path(@aircraft)
    assert_match(/installation history/, flash[:alert])

    assert installation.persisted?
  end

  private

  def assert_delete_form(path)
    assert_select "form[action='#{path}']" do
      assert_select "input[name='_method'][value='delete']", count: 1
      assert_select "button", text: "Delete"
    end
  end
end
