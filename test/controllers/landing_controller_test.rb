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

  test "shows the full landing preview on the local landing host" do
    host! "landing.localhost:3000"

    get landing_preview_path

    assert_response :success
    assert_select "body.landing-page"
    assert_select "h1", "Human flight, next generation."
    assert_select "a[href='http://localhost:3000']", "Open Sillage"
    assert_select ".sillage-workbench", count: 0
    assert_select "[data-flight-scene][data-model-url][data-seat-url][data-pilot-url][data-flow-url]", count: 1
    assert_select ".exds-flight-scene-fallback[alt]", count: 1
    assert_select "[data-scene-controls][hidden]", count: 1
    assert_select "button[data-scene-pause][aria-pressed='false']", count: 1
    assert_select "button[data-scene-view][aria-pressed='false']", count: 1
    assert_select "script[type='importmap']" do |scripts|
      imports = JSON.parse(scripts.first.text).fetch("imports")
      assert imports.key?("three")
      assert imports.key?("landing")
      assert_not imports.key?("application"), "The public landing must not load the authenticated application"
    end
  end

  test "shows the full landing preview on the production apex host" do
    host! "exopter.com"

    get landing_preview_path

    assert_response :success
    assert_select "body.landing-page"
    assert_select "a[href='#airframe']", "Airframe"
  end

  test "requires basic auth on the preview when landing credentials are configured" do
    ENV["SILLAGE_LANDING_BASIC_AUTH_USERNAME"] = "exopter"
    ENV["SILLAGE_LANDING_BASIC_AUTH_PASSWORD"] = "correct-password"
    host! "exopter.com"

    get landing_preview_path

    assert_response :unauthorized

    get landing_preview_path, headers: {
      "HTTP_AUTHORIZATION" => ActionController::HttpAuthentication::Basic.encode_credentials(
        "exopter",
        "correct-password"
      )
    }

    assert_response :success
    assert_select "body.landing-page"
  end

  test "shows the public holding page with legal links even when the preview is protected" do
    ENV["SILLAGE_LANDING_BASIC_AUTH_USERNAME"] = "exopter"
    ENV["SILLAGE_LANDING_BASIC_AUTH_PASSWORD"] = "correct-password"
    host! "exopter.com"

    get root_path

    assert_response :success
    assert_select "body.site-page"
    assert_select "h1", "Coming soon"
    assert_select ".site-hold-mark svg", count: 1
    assert_select ".site-footer a[href='#{site_support_path}']", "Support"
    assert_select ".site-footer a[href='#{site_privacy_path}']", "Privacy"
    assert_select ".site-footer a[href='#{site_legal_path}']", "Legal notice"
    assert_select "script[type='importmap']", count: 0
  end

  test "serves the public support, privacy and legal pages" do
    host! "exopter.com"

    { site_support_path => "Support", site_privacy_path => "Privacy policy", site_legal_path => "Legal notice" }.each do |path, title|
      get path

      assert_response :success
      assert_select "h1", title
      assert_select "a[href='mailto:support@exopter.com']"
    end
  end

  test "provides branded link previews for every public Exopter page" do
    host! "exopter.com"
    titles = {
      landing_root_path => "Exopter",
      site_support_path => "Support | Exopter",
      site_privacy_path => "Privacy policy | Exopter",
      site_legal_path => "Legal notice | Exopter"
    }

    titles.each do |path, title|
      get path, params: { utm_source: "test" }

      assert_response :success
      assert_no_match(/\bwing\b/i, response.body)
      assert_select "link[rel='canonical'][href=?]", "https://exopter.com#{path}", count: 1
      assert_select "meta[property='og:url'][content=?]", "https://exopter.com#{path}", count: 1
      assert_select "meta[property='og:title'][content=?]", title, count: 1
      assert_select "meta[name='twitter:title'][content=?]", title, count: 1
      description = assert_select("meta[name='description']", count: 1).first["content"]
      assert description.present?
      assert_select "meta[property='og:description'][content=?]", description, count: 1
      assert_select "meta[name='twitter:description'][content=?]", description, count: 1

      assert_select "meta[name='twitter:card'][content='summary_large_image']", count: 1
      image_url = assert_select("meta[property='og:image']", count: 1).first["content"]
      assert_match(%r{\Ahttps://exopter\.com/assets/exopter-social(?:-[a-z0-9]+)?\.png\z}, image_url)
      assert_select "meta[name='twitter:image'][content=?]", image_url, count: 1
    end
  end

  test "keeps the Sillage app root on the Sillage host" do
    host! "sillage.exopter.com"

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
