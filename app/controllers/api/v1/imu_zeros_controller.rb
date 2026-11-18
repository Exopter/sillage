module Api
  module V1
    # Sets or clears the wing zero of the assembly carrying a recorder, without a calibration run.
    class ImuZerosController < ApplicationController
      before_action :set_assembly

      def create
        return render_error("The connected recorder does not match the selected recorder. No zero was saved.") unless params.require(:expected_device_id) == params.require(:device_id)
        unless params[:mount_profile].to_s == @assembly.imu_mount_profile
          return render_error("IMU mounting changed. Reload the page and set the zero again.")
        end
        zero = Imu::Zero.call(params[:samples]&.as_json, mount_profile: @assembly.imu_mount_profile)
        return render_error(zero["reason"]) unless zero["passed"]
        @assembly.record_imu_zero!(zero, user: Current.user, device_id: @fdr.device_id, firmware: params[:firmware].to_s.presence)
        render json: { zero: @assembly.imu_zero_change_at }, status: :created
      end

      def destroy
        @assembly.record_imu_zero!(nil, user: Current.user, device_id: @fdr.device_id) if @assembly.imu_zero_at
        render json: { zero: nil }
      end

      private

      def set_assembly
        @fdr = EmbeddedController.find_by!(device_id: params.require(:device_id))
        @assembly = @fdr.assembly
        render_error("This recorder is not installed in an assembly.") unless @assembly
      end

      def render_error(message)
        render json: { error: message }, status: :unprocessable_entity
      end
    end
  end
end
