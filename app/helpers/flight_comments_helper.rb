module FlightCommentsHelper
  def comment_author_name(user)
    user.email_address.split("@").first.split(/[._-]/).map(&:capitalize).join(" ")
  end

  # Debrief summaries arrive as short Markdown lists. Render the list and bold
  # labels only; every fragment is escaped by safe_join.
  def debrief_summary(text)
    lines = text.to_s.lines.map(&:strip).reject(&:blank?)
    content_tag(:ul, class: "flight-debrief-summary") do
      safe_join(lines.map { |line| content_tag(:li, debrief_inline(line.sub(/\A[-*\u2022]\s+/, ""))) })
    end
  end

  private

  def debrief_inline(text)
    safe_join(text.split(/(\*\*.+?\*\*)/).reject(&:empty?).map do |part|
      part.match?(/\A\*\*.+\*\*\z/) ? content_tag(:strong, part[2..-3].strip.sub(/\s*:\z/, "")) : part
    end)
  end
end
