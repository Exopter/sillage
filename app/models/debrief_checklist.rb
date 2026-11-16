# Points a pilot covers aloud after a tunnel flight. Values are captured from
# the transcript; the JavaScript twin in lib/debrief_checklist.js ticks them live.
module DebriefChecklist
  ITEMS = [
    { key: "glide_ratio", label: "Glide ratio" },
    { key: "speed", label: "Speed" },
    { key: "pilot", label: "Pilot" },
    { key: "cg", label: "CG setting" },
    { key: "aoa", label: "AoA setting" },
    { key: "feelings", label: "Feelings \u00b7 IDK / IDP" },
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
