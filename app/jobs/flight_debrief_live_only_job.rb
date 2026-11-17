# Writes the Pilot log entry of debriefs whose audio never reached the server, from the words heard live.
class FlightDebriefLiveOnlyJob < ApplicationJob
  def perform
    FlightDebrief.publish_heard_without_audio!
  end
end
