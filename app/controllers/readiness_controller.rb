class ReadinessController < ActionController::API
  def show
    result = ReadinessCheck.call
    render json: result, status: result.fetch(:status) == "ok" ? :ok : :service_unavailable
  end
end
