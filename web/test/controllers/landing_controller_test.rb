require "test_helper"

class LandingControllerTest < ActionDispatch::IntegrationTest
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
    host! "sillage.wild.eu"

    get root_path

    assert_response :success
    assert_select "body.landing-page"
    assert_select "a[href='#airframe']", "Airframe"
  end

  test "keeps the OS app root on the OS host" do
    host! "os.sillage.wild.eu"

    get root_path

    assert_response :success
    assert_select "body.landing-page", count: 0
    assert_select "title", "Logbook"
  end
end
