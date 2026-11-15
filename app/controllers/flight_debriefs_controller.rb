class FlightDebriefsController < ApplicationController
  rate_limit to: 10, within: 1.minute, only: :realtime
  before_action :set_flight
  before_action :set_debrief, except: :create

  def create
    uuid = params.require(:uuid).to_s
    return head :unprocessable_entity unless uuid.match?(/\A[0-9a-f-]{36}\z/)
    @flight.with_lock do
      @debrief = @flight.flight_debriefs.find_by(uuid:)
      unless @debrief
        if @flight.flight_debriefs.where(status: "recording").exists?
          return render json: { error: "A debrief is already recording on another device." }, status: :conflict
        end
        @debrief = @flight.flight_debriefs.create!(uuid:, user: Current.user)
      end
    end
    raise ActiveRecord::RecordNotFound unless @debrief.user_id == Current.user.id
    render json: payload
  end

  def destroy
    @debrief.with_lock do
      return head :conflict if @debrief.status.in?(%w[processing published])
      @debrief.destroy!
    end
    head :no_content
  end

  def show
    render json: payload
  end

  def upload
    file = params.require(:audio)
    unless file.is_a?(ActionDispatch::Http::UploadedFile) && file.size.between?(1, 100.megabytes) && %w[audio/webm audio/mp4 audio/ogg video/webm video/mp4].include?(Marcel::MimeType.for(file.tempfile))
      return render json: { error: "Upload a supported audio recording up to 100 MB." }, status: :unprocessable_entity
    end
    @debrief.with_lock do
      unless @debrief.audio.attached?
        file.tempfile.rewind
        @debrief.audio.attach(file)
        @debrief.update!(status: "uploaded")
      end
    end
    render json: payload
  end

  def update
    @debrief.with_lock do
      return head :conflict unless @debrief.status == "ready"
      @debrief.update!(summary: params.require(:summary))
    end
    render json: payload
  end

  def process_audio
    @debrief.with_lock do
      return head :conflict unless @debrief.audio.attached?
      if @debrief.status.in?(%w[uploaded failed]) || (@debrief.status == "processing" && @debrief.updated_at < 10.minutes.ago)
        @debrief.update!(status: "uploaded", transcript: params[:transcript].to_s.first(200_000).presence || @debrief.transcript)
        FlightDebriefJob.perform_later(@debrief.id)
      end
    end
    render json: payload
  end

  def realtime
    return head :conflict unless @debrief.status == "recording"
    render json: Debriefs::OpenAi.new.realtime
  rescue Debriefs::OpenAi::Error => error
    render json: { error: error.message }, status: :service_unavailable
  end

  def publish
    @debrief.with_lock do
      unless @debrief.flight_comment
        return head :conflict unless @debrief.status == "ready"
        comment = @flight.comments.create!(user: Current.user, body: params[:summary].presence || @debrief.summary)
        @debrief.update!(flight_comment: comment, status: "published", summary: comment.body)
      end
    end
    render json: payload
  end

  private

  def set_flight
    no_store
    @flight = Flight.visible_to(Current.user).find(params[:flight_id])
  end

  def set_debrief
    @debrief = @flight.flight_debriefs.find(params[:id])
    raise ActiveRecord::RecordNotFound unless @debrief.user_id == Current.user.id || (action_name == "show" && @debrief.status == "published")
  end

  def payload
    @debrief.as_json(only: %i[id uuid status transcript summary error_message]).merge(url: flight_debrief_path(@flight, @debrief))
  end
end
