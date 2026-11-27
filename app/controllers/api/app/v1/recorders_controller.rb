module Api
  module App
    module V1
      # Lite recorders linked to the account.
      class RecordersController < BaseController
        before_action :set_ownership, only: %i[update destroy]

        def index
          ownerships = current_user.recorder_ownerships.active.includes(:embedded_controller).order(:name, :id)
          render json: { recorders: ownerships.map { |ownership| recorder_payload(ownership) } }
        end

        def update
          if @ownership.update(name: params.require(:name))
            render json: recorder_payload(@ownership)
          else
            render_error :unprocessable_entity, "invalid_name", "Use a name of 1 to #{RecorderOwnership::NAME_LENGTH.max} characters."
          end
        end

        def destroy
          @ownership.unlink!
          head :no_content
        end

        private

        def set_ownership
          @ownership = current_user.recorder_ownerships.active.find_by(id: params[:id])
          render_error :not_found, "not_found", "This recorder is not linked to your account." unless @ownership
        end
      end
    end
  end
end
