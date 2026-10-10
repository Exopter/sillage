module LandingHelper
  def landing_importmap
    Importmap::Map.new.tap { |map| map.draw(Rails.root.join("config/landing_importmap.rb")) }
  end
end
