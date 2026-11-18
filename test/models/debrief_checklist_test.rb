require "test_helper"

class DebriefChecklistTest < ActiveSupport::TestCase
  test "extracts spoken points in English and French" do
    assert_equal({ "glide_ratio" => "2.8", "speed" => "165 km/h", "cg" => "3", "aoa" => "2" },
      DebriefChecklist.extract("Glide ratio was about 2,8. Speed 165. CG setting 3, angle of attack plus 2 degrees."))
    assert_equal({ "glide_ratio" => "3.1", "speed" => "170 km/h", "cg" => "-1.5", "aoa" => "+2", "feelings" => "IDK 8 · IDP 7", "special" => "none" },
      DebriefChecklist.extract("Finesse 3.1, vitesse de 170 km/h, centrage -1.5, incidence +2. Indice de kiff 8, pureté 7. Rien de spécial."))
    assert_empty DebriefChecklist.extract("We talked for 12 minutes about nothing in particular.")
  end

  test "names the trials flown as special features: weight, leg wing, payload" do
    assert_equal "weight 2 kg", DebriefChecklist.extract("Special features: two kilos of weight on the legs.")["special"]
    assert_equal "weight 2.5 kg \u00b7 leg wing", DebriefChecklist.extract("Lest de 2,5 kg et wingsuit de jambe")["special"]
    assert_equal "leg wing \u00b7 payload 500 g", DebriefChecklist.extract("We flew the leg wingsuit with a 500 grams payload")["special"]
    assert_equal "payload", DebriefChecklist.extract("Premier vol avec la charge utile")["special"]
    assert_equal "Noted", DebriefChecklist.extract("About the special features of this suit")["special"]
    # A mass with no named trial is not one, and a speed in kilometers is not a mass.
    assert_nil DebriefChecklist.extract("I am 80 kilos, speed 150 kilometers per hour, leg strap on purple")["special"]
  end

  test "reads figures dictated digit by digit and the phrasing used in the tunnel" do
    assert_equal "speed 150, glide 2.8", DebriefChecklist.spoken_numbers("speed one five zero, glide two point eight")
    assert_equal "at one point no one moved", DebriefChecklist.spoken_numbers("at one point no one moved")
    # FLT-2026-130, 18 November 2026: a half is said, not spelled out.
    assert_equal({ "glide_ratio" => "4", "speed" => "150 km/h", "cg" => "3.5", "aoa" => "0" },
      DebriefChecklist.extract("Glide ratio 4, vitesse 150, CG setting trois et demi, AoA 0"))
    assert_equal({ "glide_ratio" => "3.5", "cg" => "2.5" }, DebriefChecklist.extract("Glide ratio 3 et demi, CG two and a half"))
    assert_equal "un moment et demie-heure", DebriefChecklist.spoken_numbers("un moment et demie-heure")
    assert_equal({ "aoa" => "0", "feelings" => "too twitchy" }, DebriefChecklist.extract("Zero degrees of angle of attack, it felt too twitchy"))
    assert_equal({ "aoa" => "none", "feelings" => "bonnes" }, DebriefChecklist.extract("Pas d'incidence, les sensations sont bonnes"))
  end

  test "keeps each figure with its own label and mends figures cut by a live line break" do
    assert_equal({ "glide_ratio" => "3.5", "speed" => "150 km/h", "cg" => "3.5", "aoa" => "0" }, DebriefChecklist.extract("Glide ratio 3.5 speed 150 CG 3.5 AoA 0"))
    assert_equal({ "glide_ratio" => "3.2", "speed" => "155 km/h", "cg" => "3.5" }, DebriefChecklist.extract("Glide ratio 3.2, speed 155, CG 3.5 AoA setting"))
    assert_equal({ "glide_ratio" => "4", "speed" => "150 km/h", "cg" => "3.5", "aoa" => "0", "feelings" => "bon" },
      DebriefChecklist.extract("Glide ratio quatre, speed 150, CG trois point five, AoA z\u00e9ro, bon feeling"))
    assert_equal "Glide ratio 3.2, speed", DebriefChecklist.spoken_numbers("Glide ratio 3 point\nTwo, speed")
    assert_equal "Glide ratio  3.2\nSpeed", DebriefChecklist.spoken_numbers("Glide ratio  3.\nTwo\nSpeed")
    assert_equal "speed 150.\nUn peu instable", DebriefChecklist.spoken_numbers("speed 150.\nUn peu instable")
  end

  test "the reading of the whole recording replaces live guesses and keeps hand ticks" do
    live = { "pilot" => "Julien", "cg" => "3.5", "aoa" => "3.5", "special" => "symmetrical leg", "feelings" => "Noted" }
    assert_equal({ "pilot" => "Julien", "feelings" => "Noted", "cg" => "3.5", "special" => "asymmetrical leg" },
      DebriefChecklist.settle(live, "CG 3.5", { "cg" => "3.5", "special" => "asymmetrical leg" }))
    # Without the model, word patterns complete what the phone sent.
    assert_equal live.merge("glide_ratio" => "3.2"), DebriefChecklist.settle(live, "Glide ratio 3.2", nil)
  end

  test "cells corrected by hand are remembered and survive a later reading" do
    checklist = { "glide_ratio" => "150", "aoa" => "3.2", "speed" => "150 km/h" }
    edited = DebriefChecklist.edit(checklist, { "glide_ratio" => " 4 ", "aoa" => "", "speed" => "150 km/h", "cg" => "", "admin" => "1" })
    assert_equal({ "speed" => "150 km/h", "glide_ratio" => "4", "edited" => %w[glide_ratio aoa] }, edited)
    assert_same checklist, DebriefChecklist.edit(checklist, { "speed" => "150 km/h" })
    # The audio lands later and is read again: typed and emptied cells stay as they were left.
    assert_equal({ "speed" => "155 km/h", "glide_ratio" => "4", "edited" => %w[glide_ratio aoa], "cg" => "3" },
      DebriefChecklist.settle(edited, "", { "glide_ratio" => "3.2", "aoa" => "0", "speed" => "155 km/h", "cg" => "3" }))
    assert_equal "4", DebriefChecklist.settle(edited, "Glide ratio 3.2", nil)["glide_ratio"]
  end

  test "ticks the field debriefs of 16 and 17 November 2026 without the model, like the phone does" do
    field = JSON.parse(file_fixture("debrief_field_transcripts.json").read)
    assert_equal 11, field.size
    field.each { |entry| assert_equal entry["expected"], DebriefChecklist.extract(entry["transcript"]), entry["flight"] }
  end

  test "normalizes model figures so both sources read the same" do
    assert_equal({ "speed" => "140 km/h", "cg" => "3.5", "feelings" => "good" },
      DebriefChecklist.from_model("speed" => "140", "cg" => "3.50", "special" => "4.0", "feelings" => "good"))
  end

  test "maps a model answer onto the checklist and folds the scores into the feelings line" do
    assert_equal({ "glide_ratio" => "3", "speed" => "170 km/h", "feelings" => "IDK 9 \u00b7 IDP 7" },
      DebriefChecklist.from_model("glide_ratio" => "3", "speed" => "170 km/h", "cg" => nil, "feelings" => "Very smooth", "idk" => 9, "idp" => "7", "other" => "x"))
    assert_equal({ "glide_ratio" => "2.8", "speed" => "165 km/h", "cg" => "3", "aoa" => "+2\u00b0", "feelings" => "really smooth", "special" => "none" },
      DebriefChecklist.from_model("glide_ratio" => "about 2,8 on the last run", "speed" => "165 km/h in the tunnel", "cg" => "Position 3, a bit forward",
        "aoa" => "+2\u00b0 nose up", "feelings" => "really smooth and stable", "special" => "none"))
    assert_equal({ "feelings" => "IDK 8" }, DebriefChecklist.from_model("idk" => "8", "special" => " "))
    # A special feature keeps its short phrase instead of being cut to its figure.
    assert_equal({ "special" => "weight 2 kg legs \u00b7 leg wing" }, DebriefChecklist.from_model("special" => " weight 2 kg legs \u00b7 leg wing "))
    assert_equal({ "special" => "Weight 2 kg on the legs, and the leg" }, DebriefChecklist.from_model("special" => "Weight 2 kg on the legs, and the leg wing as well"))
    assert_empty DebriefChecklist.from_model({})
  end

  test "keeps only known keys and short values from a client" do
    assert_equal({ "speed" => "165 km/h" }, DebriefChecklist.sanitize("speed" => " 165 km/h ", "admin" => "1", "cg" => ""))
    assert_equal 60, DebriefChecklist.sanitize("special" => "x" * 500)["special"].length
    assert_empty DebriefChecklist.sanitize(nil)
  end
end
