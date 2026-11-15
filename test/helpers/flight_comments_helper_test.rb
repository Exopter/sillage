require "test_helper"

class FlightCommentsHelperTest < ActionView::TestCase
  test "renders a debrief summary as labelled rows" do
    html = debrief_summary("- **Positives:** Stable exit.\n- **Difficultés :** Buffeting at 165 km/h.\n\nFree line")
    fragment = Nokogiri::HTML5.fragment(html)

    assert_equal 3, fragment.css("ul.flight-debrief-summary > li").size
    assert_equal %w[Positives Difficultés], fragment.css("li strong").map(&:text)
    assert_includes fragment.css("li").first.text, "Stable exit."
    assert_equal "Free line", fragment.css("li").last.text
  end

  test "escapes markup in a debrief summary" do
    html = debrief_summary("- **<b>x</b>:** <script>alert(1)</script>")

    assert_not_includes html, "<script>"
    assert_not_includes html, "<b>"
    assert_includes html, "&lt;script&gt;"
  end
end
