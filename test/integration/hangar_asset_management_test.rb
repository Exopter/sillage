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
    assert_select "a[href='#{edit_hangar_assembly_path(@assembly)}']", count: 0
    assert_select "a[href='#{hangar_assembly_path(@assembly)}']", text: "Open"
    assert_delete_form hangar_assembly_path(@assembly)

    get hangar_assembly_path(@assembly)
    assert_select "a[href='#{edit_hangar_assembly_path(@assembly)}']", text: "Edit"

    get hangar_parts_path

    assert_response :success
    assert_select "a[href='#{edit_hangar_part_path(@part)}']", text: "Edit"
    assert_delete_form hangar_part_path(@part)

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

  def assert_delete_form(path)
    assert_select "form[action='#{path}']" do
      assert_select "input[name='_method'][value='delete']", count: 1
      assert_select "button", text: "Delete"
    end
  end
end
