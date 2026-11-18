# Points a pilot covers aloud after a tunnel flight. Values are captured from
# the transcript; the JavaScript twin in lib/debrief_checklist.js ticks them live.
module DebriefChecklist
  ITEMS = [
    { key: "glide_ratio", label: "Glide ratio" },
    { key: "speed", label: "Speed" },
    { key: "cg", label: "CG setting" },
    { key: "aoa", label: "AoA setting" },
    { key: "feelings", label: "Feelings", hint: "IDK \u00b7 IDP" },
    { key: "special", label: "Special features", hint: "Weight \u00b7 load" }
  ].freeze
  KEYS = ITEMS.map { |item| item[:key] }.freeze
  # Stored beside the values: the cells corrected by hand, which no later reading may overwrite.
  EDITED = "edited".freeze
  NUMBER = /[+-]?\d+(?:[.,]\d+)?/
  GAP = /[^\d+-]{0,24}/
  # A figure belongs to the label right before it: the gap never runs over the next label.
  LABEL_GAP = /(?:(?!speed|vitesse|\bc\.?g\.?\b|\ba\.?o\.?a\.?\b)[^\d+-]){0,24}/i
  # Field debriefs of 16 November 2026: figures are dictated digit by digit, the
  # glide ratio opens the debrief as a bare number, and "no angle of attack" is an answer.
  DIGITS = { "zero" => "0", "one" => "1", "two" => "2", "three" => "3", "four" => "4", "five" => "5", "six" => "6", "seven" => "7",
    "eight" => "8", "nine" => "9", "z\u00e9ro" => "0", "un" => "1", "deux" => "2", "trois" => "3", "quatre" => "4", "cinq" => "5",
    "sept" => "7", "huit" => "8", "neuf" => "9" }.freeze
  # Case-insensitive like its JavaScript twin: a live line often starts with a capitalised figure ("Two, speed").
  DIGIT_WORD = Regexp.new(Regexp.union(DIGITS.keys).source, Regexp::IGNORECASE)
  SPOKEN = /(?<![\p{L}\d])(?:#{DIGIT_WORD})(?:[ ,]+(?:#{DIGIT_WORD}|point|dot|virgule|comma))+(?![\p{L}\d])/i
  AOA = /\ba\.?o\.?a\.?\b|angle of attack|angle d.attaque|incidence/i
  DECIMAL_WORD = /point|dot|virgule|comma/i
  # Field debrief of 18 November 2026 (FLT-2026-130): "CG trois et demi" is 3.5.
  HALF = /(?<![\p{L}\d.,])(\d+|#{DIGIT_WORD})\s+(?:et\s+demie?|and\s+a\s+half)(?!\p{L})/i
  # Field debriefs of 17 November 2026: the live transcript arrives in short lines cut wherever the
  # pilot breathes ("Glide ratio 3 point" / "Two, speed"), and a lone number word follows its label
  # ("Glide ratio, quatre", "AoA setting zero").
  LABEL = /glide\s*ratio|finesse|\bc\.?g\.?(?:\s+setting)?|(?:#{AOA})(?:\s+setting)?/i
  # Words the feeling pattern must not report as the feeling itself ("I felt I had to work").
  NOT_A_FEELING = %w[had have has to that like as if when i it we you the a and so but je que comme].freeze
  FEEL = /feel(?:ing|s)?|felt|ressentis?|sensations?/i
  # Special features are the trials flown alongside the flight itself: added weight, a leg wing, a payload.
  SPECIALS = [
    [ "weight", /\bweights?\b|\bballast|\blest|\bpoids\b|\bplombs?\b/i ],
    [ "leg wing", /\bleg[\s-]*wing(?:suit)?s?\b|\b(?:wingsuit|aile)s? de jambes?\b/i ],
    [ "payload", /\bpayloads?\b|\bcharge utile\b/i ]
  ].freeze
  # The mass said with them ("two kilos of weight", "payload 1.5 kg") belongs to the weight, else to the payload.
  MASS = /(?<![\p{L}\d.,])(#{NUMBER}|#{DIGIT_WORD})\s*(kg|kilos?|kilogram(?:me)?s?|grams?|grammes?)(?!\p{L})/i
  NOTHING_SPECIAL = /rien de sp[e\u00e9]cial|nothing special|no special feature|(?:pas de|aucune) particularit/i

  module_function

  # "one five zero" becomes "150", "two point eight" becomes "2.8" and "trois et demi" becomes "3.5".
  # A lone number word is left alone.
  def spoken_numbers(text)
    mended = text.gsub(HALF) { "#{DIGITS.fetch($1.downcase, $1)}.5" }.gsub(/\b(#{DECIMAL_WORD})[ \t]*\n\s*/i, "\\1 ")
      .gsub(/(?<![\p{L}\d.,])(\d)\.[ \t]*\n\s*(#{DIGIT_WORD})(?=\s*(?:[,.]|\n|\z))/i) { "#{$1}.#{DIGITS[$2.downcase]}" }
    spoken = mended.gsub(SPOKEN) do |run|
      figure = run.downcase.split(/[ ,]+/).map { |word| DIGITS.fetch(word, ".") }.join
      figure.match?(/\A\d+(?:\.\d+)?\z/) ? figure : run
    end
    spoken.gsub(/(?<![\p{L}\d.,])(\d+)\s+(?:#{DECIMAL_WORD})\s+(#{DIGIT_WORD}|\d)(?![\p{L}\d])/i) { "#{$1}.#{DIGITS.fetch($2.downcase, $2)}" }
      .gsub(/((?:#{LABEL})[\s,:.]*(?:(?:is|was|at|est|\u00e0|de|of)\s+)?)(#{DIGIT_WORD})(?=\s*(?:[,.;:]|\n|\z)|\s+(?:speed|vitesse|c\.?g\b|a\.?o\.?a|kilo|km|degr))/i) { "#{$1}#{DIGITS[$2.downcase]}" }
  end

  def extract(transcript)
    text = spoken_numbers(transcript.to_s)
    found = {}
    # The glide ratio opens the debrief; when its name is clipped or misheard it is the bare figure before the speed.
    glide = text[/(?:glide\s*ratio|glide|finesse)#{LABEL_GAP}(#{NUMBER})/i, 1] ||
      text[/\A\s*(?:\p{L}+[\s,]+){0,3}(\d[.,]\d+)(?:\s+\d[.,]\d+)?[\s,]*(?:speed|vitesse)/i, 1] ||
      text[/(\d[.,]\d+)\s*(?:of\s+)?glide\s*ratio/i, 1]
    found["glide_ratio"] = glide.tr(",", ".") if glide
    capture(found, "speed", text, /(?:speed|vitesse)#{LABEL_GAP}(\d{2,3})/i) { |value| "#{value} km/h" }
    capture(found, "cg", text, /(?:\bc\.?g\.?\b|cent(?:er|re) (?:of|de) gravit[ye\u00e9]|centrage)#{LABEL_GAP}(#{NUMBER})/i)
    # "CG 3.5 AoA 0": a figure in front of the label is the angle only when a unit or "of" ties them.
    before = text.match(/(?:\b(zero|z\u00e9ro)|(#{NUMBER}))\s*(?:(?:degrees?|degr[e\u00e9]s?|\u00b0)\s*(?:of\s+|d[e\u2019']\s*)?|of\s+|d[e\u2019']\s*)(?:#{AOA})/i)
    aoa = if text.match?(/\b(?:no|sans|pas d[e\u2019'])\s*(?:#{AOA})/i) then "none"
    elsif before then before[1] ? "0" : before[2].tr(",", ".")
    else text[/(?:#{AOA})#{LABEL_GAP}(#{NUMBER})/i, 1]&.tr(",", ".") || ("0" if text.match?(/\b(?:zero|z\u00e9ro)\s+(?:#{AOA})/i))
    end
    found["aoa"] = aoa if aoa
    idk = text[/(?:\bidk\b|indice de kiff|\bkiff\b)#{GAP}(#{NUMBER})/i, 1]
    idp = text[/(?:\bidp\b|indice de puret[e\u00e9]|\bpuret[e\u00e9])#{GAP}(#{NUMBER})/i, 1]
    scores = [ ("IDK #{idk}" if idk), ("IDP #{idp}" if idp) ].compact
    felt = scores.any? ? scores.join(" \u00b7 ") : feeling(text)
    found["feelings"] = felt if felt
    noted = special(text)
    found["special"] = noted if noted
    found
  end

  # "weight 2 kg \u00b7 leg wing" when trials are named, "none" when the pilot rules them out.
  def special(text)
    named = SPECIALS.select { |_, pattern| text.match?(pattern) }.map(&:first)
    mass = text.match(MASS)
    if mass && (owner = (%w[weight payload] & named).first)
      figure = "#{DIGITS.fetch(mass[1].downcase, mass[1]).tr(",", ".")} #{mass[2].match?(/\Ag/i) ? "g" : "kg"}"
      named = named.map { |name| name == owner ? "#{name} #{figure}" : name }
    end
    return named.join(" \u00b7 ") if named.any?
    return "none" if text.match?(NOTHING_SPECIAL)

    "Noted" if text.match?(/special feature|particularit|sp[e\u00e9]cificit/i)
  end

  def feeling(text)
    before = text[/\b(good|great|bad|better|worse|nice|weird|strange|bon|bonne|mauvais|super)\s+(?:#{FEEL})\b/i, 1]
    return before.downcase if before

    after = text.match(/\b(?:#{FEEL})\b[\s:,]*((?:(?:is|was|are|were|still|it|the|a|that|i|very|much|quite|est|sont|c.est)\s+)*)(more|less|not|too|turning|plus|moins|pas)?\s*(\p{L}+)?/i)
    return unless after

    word = after[3] unless NOT_A_FEELING.include?(after[3].to_s.downcase)
    [ after[2], word ].compact.join(" ").downcase.presence || "Noted"
  end

  # The checklist kept with the debrief once the whole recording has been read. That reading
  # replaces what was detected live, wrong guesses included; the phone keeps what only it
  # knows: the points ticked by hand. Without the model, word patterns complete the live values.
  def settle(live, transcript, understood)
    edited = Array(live[EDITED])
    read = understood || extract(transcript)
    kept = understood ? live.reject { |key, value| KEYS.include?(key) && value != "Noted" && edited.exclude?(key) } : live
    # A cell corrected by hand in the Pilot log is never rewritten, emptied ones included.
    kept.merge(read.except(*edited))
  end

  # Applies the cells typed in the Pilot log and remembers which ones were changed by hand.
  def edit(checklist, values)
    typed = sanitize(values)
    changed = KEYS.select { |key| values.respond_to?(:key?) && values.key?(key) && typed[key] != checklist[key] }
    return checklist if changed.empty?

    checklist.except(*changed).merge(typed.slice(*changed)).merge(EDITED => (Array(checklist[EDITED]) | changed))
  end

  UNIT = %r{km/h|kmh|mph|m/s|kts?|knots|\u00b0|deg(?:rees)?|%|mm|cm}i

  # Maps the model's answer onto the checklist. The remote shows the value beside
  # the tick, so each one is cut to the figure or a couple of words. Special
  # features keep their short phrase: "weight 2 kg legs" is not the figure 2. The
  # two scores live on the feelings line and replace its wording when given.
  def from_model(answer)
    values = answer.to_h.to_h { |key, value| [ key, key.to_s == "special" ? phrase(value) : brief(value) ] }.compact
    scores = [ ("IDK #{values["idk"]}" if values["idk"]), ("IDP #{values["idp"]}" if values["idp"]) ].compact
    feelings = scores.any? ? scores.join(" \u00b7 ") : values["feelings"]
    # A tunnel speed is in km/h; a bare figure gets its unit so both sources read the same.
    values["speed"] = "#{values["speed"]} km/h" if values["speed"]&.match?(/\A\d{2,3}\z/)
    # A figure is not a special feature: the model sometimes echoes a neighbouring number.
    values.delete("special") if values["special"]&.match?(/\A#{NUMBER}\z/)
    sanitize(values.slice("glide_ratio", "speed", "cg", "aoa", "special").merge("feelings" => feelings))
  end

  # "Position 3, a bit forward" becomes "3"; "really smooth and stable" becomes "really smooth".
  def brief(value)
    text = value.to_s.strip
    figure = text[/#{NUMBER}(?:\s?(?:#{UNIT})(?![[:alpha:]]))?/]
    return figure.tr(",", ".").sub(/(\.\d*[1-9])0+(?=\D|\z)/, "\\1") if figure

    text.split.first(2).join(" ").delete_suffix(",").first(18).presence
  end

  # "Weight 2 kg on the legs, and the leg wing as well" is cut at a word: "Weight 2 kg on the legs, and the leg".
  def phrase(value)
    value.to_s.squish.truncate(36, separator: " ", omission: "").sub(/[\s,;\u00b7]+\z/, "").presence
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
