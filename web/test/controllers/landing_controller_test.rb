require "test_helper"

class LandingControllerTest < ActionDispatch::IntegrationTest
  setup do
    @auth_username = ENV["SILLAGE_LANDING_BASIC_AUTH_USERNAME"]
    @auth_password = ENV["SILLAGE_LANDING_BASIC_AUTH_PASSWORD"]
  end

  teardown do
    restore_env("SILLAGE_LANDING_BASIC_AUTH_USERNAME", @auth_username)
    restore_env("SILLAGE_LANDING_BASIC_AUTH_PASSWORD", @auth_password)
  end

  test "shows the landing page on the local landing host" do
    host! "landing.localhost:3000"

    get root_path

    assert_response :success
    assert_select "body.landing-page"
    assert_select "h1", "Human flight, next generation."
    assert_select "a[href='http://localhost:3000']", "Open OS"
    assert_select ".sillage-workbench", count: 0
  end

  test "shows the landing page on the production apex host" do
    host! "exopter.com"

    get root_path

    assert_response :success
    assert_select "body.landing-page"
    assert_select "a[href='#airframe']", "Airframe"
  end

  test "requires basic auth when landing credentials are configured" do
    ENV["SILLAGE_LANDING_BASIC_AUTH_USERNAME"] = "exopter"
    ENV["SILLAGE_LANDING_BASIC_AUTH_PASSWORD"] = "correct-password"
    host! "exopter.com"

    get root_path

    assert_response :unauthorized

    get root_path, headers: {
      "HTTP_AUTHORIZATION" => ActionController::HttpAuthentication::Basic.encode_credentials(
        "exopter",
        "correct-password"
      )
    }

    assert_response :success
    assert_select "body.landing-page"
  end

  test "keeps the OS app root on the OS host" do
    host! "os.exopter.com"

    get root_path

    assert_redirected_to new_session_path
  end

  private

  def restore_env(key, value)
    if value.nil?
      ENV.delete(key)
    else
      ENV[key] = value
    end
  end
end
