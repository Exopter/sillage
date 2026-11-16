require "test_helper"

class DebriefChecklistTest < ActiveSupport::TestCase
  test "extracts spoken points in English and French" do
    assert_equal({ "glide_ratio" => "2.8", "speed" => "165 km/h", "cg" => "3", "aoa" => "2" },
      DebriefChecklist.extract("Glide ratio was about 2,8. Speed 165. CG setting 3, angle of attack plus 2 degrees."))
    assert_equal({ "glide_ratio" => "3.1", "speed" => "170 km/h", "cg" => "-1.5", "aoa" => "+2", "feelings" => "IDK 8 · IDP 7", "special" => "Noted" },
      DebriefChecklist.extract("Finesse 3.1, vitesse de 170 km/h, centrage -1.5, incidence +2. Indice de kiff 8, pureté 7. Rien de spécial."))
    assert_empty DebriefChecklist.extract("We talked for 12 minutes about nothing in particular.")
  end

  test "maps a model answer onto the checklist and folds the scores into the feelings line" do
    assert_equal({ "glide_ratio" => "3", "speed" => "170 km/h", "feelings" => "IDK 9 \u00b7 IDP 7" },
      DebriefChecklist.from_model("glide_ratio" => "3", "speed" => "170 km/h", "cg" => nil, "feelings" => "Very smooth", "idk" => 9, "idp" => "7", "other" => "x"))
    assert_equal({ "glide_ratio" => "2.8", "speed" => "165 km/h", "cg" => "3", "aoa" => "+2\u00b0", "feelings" => "really smooth", "special" => "none" },
      DebriefChecklist.from_model("glide_ratio" => "about 2,8 on the last run", "speed" => "165 km/h in the tunnel", "cg" => "Position 3, a bit forward",
        "aoa" => "+2\u00b0 nose up", "feelings" => "really smooth and stable", "special" => "none"))
    assert_equal({ "feelings" => "IDK 8" }, DebriefChecklist.from_model("idk" => "8", "special" => " "))
    assert_empty DebriefChecklist.from_model({})
  end

  test "keeps only known keys and short values from a client" do
    assert_equal({ "speed" => "165 km/h" }, DebriefChecklist.sanitize("speed" => " 165 km/h ", "admin" => "1", "cg" => ""))
    assert_equal 60, DebriefChecklist.sanitize("special" => "x" * 500)["special"].length
    assert_empty DebriefChecklist.sanitize(nil)
  end
end
