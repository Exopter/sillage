require "test_helper"

module Devreference
  class DesignSystemControllerTest < ActionDispatch::IntegrationTest
    setup { sign_in_as users(:julien) }

    test "shows the design system reference page" do
      get devreference_design_system_path

      assert_response :success
      assert_select "h1", "Exopter Design System"
      assert_select ".reference-swatch-card", minimum: 12
      assert_select ".reference-hud-panel"
      assert_select ".reference-check-grid .reference-panel", minimum: 5
      assert_select "td", "HUD-03"
      assert_select "a[href='https://app.notion.com/p/3abe497e504f81c8a557e1f1a26e09ae']", minimum: 2
      assert_select "h2", "One Shared Workbench Shell"
    end
  end
end
