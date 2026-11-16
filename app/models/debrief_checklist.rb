# Points a pilot covers aloud after a tunnel flight. Values are captured from
# the transcript; the JavaScript twin in lib/debrief_checklist.js ticks them live.
module DebriefChecklist
  ITEMS = [
    { key: "glide_ratio", label: "Glide ratio" },
    { key: "speed", label: "Speed" },
    { key: "pilot", label: "Pilot" },
    { key: "cg", label: "CG setting" },
    { key: "aoa", label: "AoA setting" },
    { key: "feelings", label: "Feelings", hint: "IDK \u00b7 IDP" },
    { key: "special", label: "Special features" }
  ].freeze
  KEYS = ITEMS.map { |item| item[:key] }.freeze
  NUMBER = /[+-]?\d+(?:[.,]\d+)?/
  GAP = /[^\d+-]{0,24}/

  module_function

  def extract(transcript)
    text = transcript.to_s
    found = {}
    capture(found, "glide_ratio", text, /(?:glide\s*ratio|glide|finesse)#{GAP}(#{NUMBER})/i)
    capture(found, "speed", text, /(?:speed|vitesse)#{GAP}(\d{2,3})/i) { |value| "#{value} km/h" }
    capture(found, "cg", text, /(?:\bc\.?g\.?\b|cent(?:er|re) (?:of|de) gravit[ye\u00e9]|centrage)#{GAP}(#{NUMBER})/i)
    capture(found, "aoa", text, /(?:\ba\.?o\.?a\.?\b|angle of attack|angle d.attaque|incidence)#{GAP}(#{NUMBER})/i)
    idk = text[/(?:\bidk\b|indice de kiff|\bkiff\b)#{GAP}(#{NUMBER})/i, 1]
    idp = text[/(?:\bidp\b|indice de puret[e\u00e9]|\bpuret[e\u00e9])#{GAP}(#{NUMBER})/i, 1]
    scores = [ ("IDK #{idk}" if idk), ("IDP #{idp}" if idp) ].compact
    found["feelings"] = scores.join(" \u00b7 ") if scores.any?
    found["special"] = "Noted" if text.match?(/special feature|particularit|rien de sp[e\u00e9]cial|nothing special|sp[e\u00e9]cificit/i)
    found
  end

  UNIT = %r{km/h|kmh|mph|m/s|kts?|knots|\u00b0|deg(?:rees)?|%|mm|cm}i

  # Maps the model's answer onto the checklist. The remote shows the value beside
  # the tick, so each one is cut to the figure or a couple of words. The two
  # scores live on the feelings line and replace its wording when given.
  def from_model(answer)
    values = answer.to_h.transform_values { |value| brief(value) }.compact
    scores = [ ("IDK #{values["idk"]}" if values["idk"]), ("IDP #{values["idp"]}" if values["idp"]) ].compact
    feelings = scores.any? ? scores.join(" \u00b7 ") : values["feelings"]
    sanitize(values.slice("glide_ratio", "speed", "cg", "aoa", "special").merge("feelings" => feelings))
  end

  # "Position 3, a bit forward" becomes "3"; "really smooth and stable" becomes "really smooth".
  def brief(value)
    text = value.to_s.strip
    figure = text[/#{NUMBER}(?:\s?(?:#{UNIT})(?![[:alpha:]]))?/]
    return figure.tr(",", ".") if figure

    text.split.first(2).join(" ").delete_suffix(",").first(18).presence
  end

  # Keeps only known keys and short text values, whatever the client sent.
  def sanitize(values)
    return {} unless values.respond_to?(:to_h)

    values.to_h.slice(*KEYS).transform_values { |value| value.to_s.strip.first(60) }.reject { |_, value| value.empty? }
  end

  def capture(found, key, text, pattern)
    value = text[pattern, 1]
    return unless value

    value = value.tr(",", ".")
    found[key] = block_given? ? yield(value) : value
  end
end
