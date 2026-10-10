module Api
  module V1
    class ImuChecksController < ApplicationController
      before_action :set_context

      def index
        firmware = params[:firmware].to_s
        reference = ImuCheck.reference_for(@fdr, firmware:)
        check = @flight && @flight.imu_checks.where(embedded_controller: @fdr, kind: "preflight",
          configuration_digest: ImuCheck.configuration_digest_for(@fdr), firmware:).recent.first
        check = nil if check && (!reference || check.calibration_id != reference.id)
        render json: { reference: reference && payload(reference), preflight: check && payload(check) }
      end

      def create
        kind = params.require(:kind)
        return render_error("A flight is required for a preflight check.") if kind == "preflight" && !@flight
        return render_error("Unknown check type.") unless %w[calibration preflight].include?(kind)
        return render_error("Confirm the ground reference before running this check.") unless params[:ground_reference_confirmed] == true
        firmware = params.require(:firmware).to_s
        return render_error("Quality-capable firmware is required.") unless firmware.match?(/\Afdr_integrated\/\d{2,4}\z/) && firmware.split("/").last.to_i >= 56
        existing = ImuCheck.find_by(uuid: params.require(:uuid))
        if existing
          return head :conflict unless existing.user == Current.user && existing.embedded_controller == @fdr && existing.flight == @flight && existing.kind == kind
          return render json: payload(existing)
        end
        samples = params[:samples]&.as_json
        summary = Imu::Assessment.call(samples, firmware:)
        reference = ImuCheck.reference_for(@fdr, firmware:)
        if kind == "calibration"
          faces = params[:faces]&.as_json
          unless faces.is_a?(Hash) && %w[x+ x- y+ y- z+ z-].all? { |face| faces[face].is_a?(Numeric) && faces[face].between?(3000, 300_000) } && params[:figure_eight_confirmed] == true
            return render_error("Complete all six faces and the slow rotation tutorial.")
          end
        elsif !reference
          return render_error("Complete a calibration reference in Forge for this configuration and firmware first.")
        end
        if kind == "preflight" && reference && summary["magnetic_mean_ut"]
          baseline = reference.summary["magnetic_mean_ut"]
          if baseline && (summary["magnetic_mean_ut"] - baseline).abs > [ 15, baseline * 0.35 ].max
            summary.merge!("passed" => false, "reason" => "Magnetic field differs from the Forge reference. Check the installation environment.")
          end
        end
        check = ImuCheck.create!(embedded_controller: @fdr, user: Current.user, flight: @flight,
          calibration: kind == "preflight" ? reference : nil, uuid: params[:uuid], kind:,
          outcome: summary["passed"] ? "passed" : "failed", firmware:, boot_id: params.require(:boot_id),
          imu_epoch: params.require(:imu_epoch), configuration_digest: ImuCheck.configuration_digest_for(@fdr),
          evidence: { device_id: @fdr.device_id, configuration: ImuCheck.configuration_for(@fdr), samples:, faces: params[:faces]&.as_json, figure_eight_confirmed: params[:figure_eight_confirmed],
                      ground_reference_confirmed: true, source: "operator_browser_radio" }, summary:)
        render json: payload(check), status: :created
      rescue ActiveRecord::RecordInvalid => error
        render_error(error.record.errors.full_messages.to_sentence)
      end

      private

      def set_context
        if action_name == "create" && params.require(:expected_device_id) != params.require(:device_id)
          return render_error("The connected recorder does not match the selected recorder. No check was saved.")
        end
        @fdr = EmbeddedController.find_by!(device_id: params.require(:device_id))
        @flight = Current.user.flights.find(params[:flight_id]) if params[:flight_id].present?
        if @flight&.aircraft && @fdr.aircraft != @flight.aircraft
          render_error("This recorder is not installed on the selected aircraft.")
        end
      end

      def payload(check)
        check.as_json(only: %i[id kind outcome firmware boot_id imu_epoch summary created_at invalidated_at invalidation_reason]).merge(device_id: check.embedded_controller.device_id)
      end

      def render_error(message)
        render json: { error: message }, status: :unprocessable_entity
      end
    end
  end
end
