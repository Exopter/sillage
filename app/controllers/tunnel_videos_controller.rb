class TunnelVideosController < ApplicationController
  # Removes every camera of a clip filmed outside the flight.
  def destroy
    flight = Flight.visible_to(Current.user).find(params[:flight_id])
    raise ActiveRecord::RecordNotFound unless can_manage_operations?

    flight.tunnel_videos.find(params[:id]).clip_group.each { |video| video.ignore!("Removed by #{Current.user.email_address}") }
    redirect_to flight, notice: t("flights.video.tunnel_removed")
  end
end
