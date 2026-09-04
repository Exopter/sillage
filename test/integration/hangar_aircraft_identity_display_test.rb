require "test_helper"

class HangarAircraftIdentityDisplayTest < ActionDispatch::IntegrationTest
  setup do
    function = Function.create!(code: "IDENTITY_DISPLAY", name: "Identity display")
    assembly = Assembly.create!(name: "Display assembly")
    @unserialized_part = create_installed_part(
      assembly:,
      function:,
      manufacturer: "Holybro",
      model: "M9N"
    )
    @serialized_part = create_installed_part(
      assembly:,
      function:,
      manufacturer: "MatekSys",
      model: "ASPD-AUAV",
      serial_number: "ASPD-0001"
    )
    aircraft = Aircraft.create!(registration: "F-ID", name: "Identity display aircraft")
    Installation.create!(aircraft:, installable: assembly, installed_at: Time.current)

    sign_in_as users(:operator)
  end

  test "aircraft configuration does not repeat an unserialized part Asset ID" do
    get hangar_path

    assert_response :success
    assert_select ".hangar-tree-row strong",
      text: "#{@unserialized_part.internal_number} · #{@unserialized_part.display_name}", count: 1
    assert_select ".hangar-tree-row small",
      text: "Asset ID #{@unserialized_part.internal_number}", count: 0
    assert_select ".hangar-tree-row strong",
      text: "#{@serialized_part.serial_number} · #{@serialized_part.display_name}", count: 1
    assert_select ".hangar-tree-row small",
      text: "Asset ID #{@serialized_part.internal_number}", count: 1
  end
end
