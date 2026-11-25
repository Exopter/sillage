require "test_helper"

class OperatorAccessTest < ActionDispatch::IntegrationTest
  setup do
    @operator = users(:member)
    @operator.update!(role: "operator")
    @operator.complete_membership_welcome!
    sign_in_as @operator
  end

  test "operators can open every operational room and use Signal acquisition" do
    [ flights_path, hangar_path, forge_path, signal_path ].each do |path|
      get path
      assert_response :success
      assert_equal [ "Flights", "Hangar", "Forge", "Signal" ], css_select(".sillage-room-nav a").map { |link| link.text.strip }
      assert_select "a[href^='/core']", count: 0
    end
    assert_select "[data-controller='signal-workspace']"
  end

  test "operators can update part state in Hangar" do
    function = Function.create!(code: "SENSOR", name: "Sensor")
    part = Part.create!(function:, model: "Reference sensor")

    get edit_hangar_part_path(part)
    assert_response :success
    assert_select "select[name='part[state]'] option[value='quarantined']"
    patch hangar_part_path(part), params: { part: { state: "quarantined" } }

    assert_redirected_to hangar_part_path(part)
    assert_equal "quarantined", part.reload.state
  end

  test "Core rejects direct reads and role changes from operators" do
    [ core_path, core_users_path, core_feedbacks_path, edit_core_user_path(@operator) ].each do |path|
      get path
      assert_response :forbidden
    end

    patch core_user_path(@operator), params: { user: { role: "admin" } }, as: :json
    assert_response :forbidden
    assert_equal "operator", @operator.reload.role
  end
end
