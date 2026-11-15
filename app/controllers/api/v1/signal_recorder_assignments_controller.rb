module Api
  module V1
    class SignalRecorderAssignmentsController < ApplicationController
      def create
        raise Signal::AssignRecorder::InvalidAssignment, "Board replacement is not available here." if params[:replace_board].present?

        recorder = Signal::AssignRecorder.new(device_id: params.require(:device_id), actor: Current.user,
          assembly_id: params[:assembly_id], configuration_id: params[:configuration_id],
          assembly_method: params[:assembly_method], component_type: params[:fdr_component_type]).call
        response.headers["Cache-Control"] = "no-store"
        render json: { device_id: recorder.device_id, assembly_id: recorder.assembly.id }
      rescue Signal::AssignRecorder::InvalidAssignment, ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound => error
        render json: { error: error.message }, status: :unprocessable_entity
      end
    end
  end
end
