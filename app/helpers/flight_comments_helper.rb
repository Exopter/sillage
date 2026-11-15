module FlightCommentsHelper
  DEBRIEF_LABEL = /\A(?<label>\p{L}[\p{L} '\u2019\/-]{1,39}?)\s*:\s+(?<text>\S.*)\z/

  def comment_author_name(user)
    user.email_address.split("@").first.split(/[._-]/).map(&:capitalize).join(" ")
  end

  # Debrief summaries are short lines, each optionally opened by a label
  # ("Positives: ..."). Older entries use Markdown bullets and bold labels.
  # Every fragment is escaped by content_tag and safe_join.
  def debrief_summary(text)
    lines = text.to_s.lines.map { |line| line.strip.sub(/\A[-*\u2022]\s+/, "") }.reject(&:blank?)
    content_tag(:ul, class: "flight-debrief-summary") do
      safe_join(lines.map { |line| content_tag(:li, debrief_line(line)) })
    end
  end

  private

  def debrief_line(line)
    plain = line.gsub(/\*\*(.+?)\*\*/, "\\1")
    match = DEBRIEF_LABEL.match(plain)
    return plain unless match

    safe_join([ content_tag(:strong, match[:label].strip), match[:text] ])
  end
end
