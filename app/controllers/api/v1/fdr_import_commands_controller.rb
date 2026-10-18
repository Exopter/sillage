module Api
  module V1
    class FdrImportCommandsController < ApplicationController
      before_action :set_recorder

      def index
        presence = @recorder.signal_presence
        render json: {
          queue: presence&.fresh? ? presence.status["import_queue"] : nil,
          commands: @recorder.fdr_import_commands.order(id: :desc).limit(32).as_json(only: %i[id action file_index status result])
        }
      end

      def create
        presence = @recorder.signal_presence
        queue = presence&.status&.fetch("import_queue", nil)
        unless presence&.fresh? && queue.is_a?(Hash) && queue["version"] == 1
          return render json: { error: "Connect a recorder with import queue firmware over Wi-Fi or USB-C." }, status: :conflict
        end
        action = FdrImportCommand::ACTIONS.fetch(params[:action_name].to_s)
        index = Integer(params.fetch(:file_index, 0).to_s, 10)
        boot = Integer(params.fetch(:file_boot_id, 0).to_s, 10)
        if ([ 4, 5 ].include?(action) && (index != 0 || boot != 0)) || ([ 1, 2, 3 ].include?(action) && index <= 0) || (action == 7 && boot != 0)
          return render json: { error: "Invalid recording selection." }, status: :unprocessable_entity
        end
        command = @recorder.fdr_import_commands.create!(
          requested_by: Current.user, recorder_boot_id: queue.fetch("boot_id"),
          action:, file_index: index, file_boot_id: boot, expires_at: 10.minutes.from_now
        )
        render json: { id: command.id, status: command.status }, status: :created
      rescue KeyError, ArgumentError, TypeError, ActiveRecord::RecordInvalid => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      private

      def set_recorder
        @recorder = EmbeddedController.find_by!(device_id: FdrIdentity::DeviceId.normalize(params.require(:device_id)))
      end
    end
  end
end
