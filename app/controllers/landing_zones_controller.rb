class LandingZonesController < ApplicationController
  before_action :set_landing_zone, only: %i[show edit update destroy]

  def index
    @landing_zones = LandingZone.ordered
    @map_style_url = ENV["MAPLIBRE_STYLE_URL"].presence
    @tile_prefetch_enabled = ENV["MAPLIBRE_TILE_PREFETCH_ENABLED"] == "true"
  end

  def show; end

  def new
    @landing_zone = LandingZone.new(detection_radius_km: 25)
  end

  def create
    @landing_zone = LandingZone.new(landing_zone_params)
    if @landing_zone.save
      redirect_to @landing_zone, notice: "Landing zone created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit; end

  def update
    if @landing_zone.update(landing_zone_params)
      redirect_to @landing_zone, notice: "Landing zone updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    if @landing_zone.destroy
      redirect_to atlas_path, notice: "Landing zone deleted."
    else
      redirect_to @landing_zone, alert: @landing_zone.errors.full_messages.to_sentence
    end
  end

  private

  def set_landing_zone
    @landing_zone = LandingZone.find(params[:id])
  end

  def landing_zone_params
    params.require(:landing_zone).permit(
      :code, :name, :latitude, :longitude, :elevation_m, :detection_radius_km,
      :practical_information, :notes
    )
  end
end
