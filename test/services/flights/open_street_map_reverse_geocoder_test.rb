require "test_helper"

class Flights::OpenStreetMapReverseGeocoderTest < ActiveSupport::TestCase
  test "returns the nearest named aerodrome within three kilometres" do
    geocoder, requests = geocoder_with_responses(
      [
        aerodrome("Aérodrome de Montaigu de Quercy", 44.3642311, 1.0866964),
        aerodrome("Aérodrome de Bouloc", 44.3066948, 1.0804591)
      ]
    )

    location = geocoder.reverse(latitude: 44.3065896, longitude: 1.0820855)

    assert_equal "Aérodrome de Bouloc", location
    assert_equal 1, requests.size
    assert_equal "/search", requests.first.path
    query = Rack::Utils.parse_query(requests.first.query)
    assert_equal "aerodrome", query.fetch("q")
    assert_equal "jsonv2", query.fetch("format")
    assert_equal "1", query.fetch("bounded")
    assert_equal "en", query.fetch("accept-language")
  end

  test "finds the named aerodrome near the Brienne landing point" do
    geocoder, = geocoder_with_responses(
      [ aerodrome("Aérodrome de Brienne-le-Château", 48.4264476, 4.4806297) ]
    )

    location = geocoder.reverse(latitude: 48.4259951, longitude: 4.4653711)

    assert_equal "Aérodrome de Brienne-le-Château", location
  end

  test "falls back to reverse geocoding when no nearby aerodrome is found" do
    geocoder, requests = geocoder_with_responses(
      [],
      {
        "name" => "Arcachon-La Teste aerodrome",
        "display_name" => "Arcachon-La Teste aerodrome, La Teste-de-Buch, France"
      }
    )

    location = geocoder.reverse(latitude: 44.59701, longitude: -1.11649)

    assert_equal "Arcachon-La Teste aerodrome", location
    assert_equal 2, requests.size
    assert_equal "/reverse", requests.second.path
    query = Rack::Utils.parse_query(requests.second.query)
    assert_equal "44.59701", query.fetch("lat")
    assert_equal "-1.11649", query.fetch("lon")
    assert_equal "jsonv2", query.fetch("format")
    assert_equal "18", query.fetch("zoom")
    assert_equal "en", query.fetch("accept-language")
  end

  test "falls back to a concise settlement label" do
    geocoder, = geocoder_with_responses(
      [],
      {
        "address" => {
          "village" => "Saint-Hilaire",
          "state" => "Occitanie",
          "country" => "France"
        },
        "display_name" => "A long address that should not be selected"
      }
    )

    assert_equal "Saint-Hilaire, Occitanie, France", geocoder.reverse(latitude: 44.1, longitude: 3.1)
  end

  test "ignores aerodromes outside the search radius" do
    geocoder, requests = geocoder_with_responses(
      [ aerodrome("Distant aerodrome", 44.2, 3.1) ],
      { "name" => "Nearby village" }
    )

    assert_equal "Nearby village", geocoder.reverse(latitude: 44.1, longitude: 3.1)
    assert_equal 2, requests.size
  end

  test "caches nearby landing points" do
    geocoder, requests = geocoder_with_responses(
      [ aerodrome("Gap-Tallard aerodrome", 44.45501, 6.03781) ]
    )

    first = geocoder.reverse(latitude: 44.45501, longitude: 6.03781)
    second = geocoder.reverse(latitude: 44.45502, longitude: 6.03782)

    assert_equal "Gap-Tallard aerodrome", first
    assert_equal first, second
    assert_equal 1, requests.size
  end

  test "raises a retryable error for a provider failure" do
    geocoder, = geocoder_with_responses({}, status: 429)

    error = assert_raises(Flights::OpenStreetMapReverseGeocoder::Error) do
      geocoder.reverse(latitude: 44.59701, longitude: -1.11649)
    end

    assert_equal "Aerodrome search returned HTTP 429.", error.message
  end

  test "ignores the invalid zero coordinate" do
    geocoder, requests = geocoder_with_responses([ aerodrome("Null Island", 0, 0) ])

    assert_nil geocoder.reverse(latitude: 0, longitude: 0)
    assert_empty requests
  end

  private

  def aerodrome(name, latitude, longitude)
    {
      "category" => "aeroway",
      "type" => "aerodrome",
      "name" => name,
      "lat" => latitude.to_s,
      "lon" => longitude.to_s
    }
  end

  def geocoder_with_responses(*payloads, status: 200)
    requests = []
    responses = payloads.map { |payload| [ status, payload.to_json ] }
    geocoder = Flights::OpenStreetMapReverseGeocoder.new(
      cache: ActiveSupport::Cache::MemoryStore.new,
      rate_limiter: ->(&block) { block.call }
    )
    geocoder.define_singleton_method(:perform_request) do |uri|
      requests << uri
      responses.shift || raise("Unexpected geocoding request")
    end
    [ geocoder, requests ]
  end
end
