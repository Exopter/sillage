module Hangar
  class FdrWifiProfilesController < BaseController
    before_action :set_assembly
    before_action :ensure_flight_data_recorder
    before_action :set_profile, only: %i[update destroy move]

    def create
      credential = selected_or_saved_credential
      profile = @assembly.fdr_wifi_profiles.build(
        wifi_credential: credential,
        position: @assembly.fdr_wifi_profiles.count,
        enabled: true
      )

      if credential.persisted? && profile.save
        redirect_to connectivity_hangar_assembly_path(@assembly), notice: "#{credential.ssid} added to the recorder configuration."
      else
        errors = credential.errors.full_messages + profile.errors.full_messages
        redirect_to connectivity_hangar_assembly_path(@assembly), alert: errors.to_sentence.presence || "The Wi-Fi network could not be saved."
      end
    end

    def update
      if @profile.update(enabled: ActiveModel::Type::Boolean.new.cast(params.require(:enabled)))
        redirect_to connectivity_hangar_assembly_path(@assembly), notice: "Wi-Fi profile updated."
      else
        redirect_to connectivity_hangar_assembly_path(@assembly), alert: @profile.errors.full_messages.to_sentence
      end
    end

    def move
      offset = params.require(:direction) == "up" ? -1 : 1
      target = @assembly.fdr_wifi_profiles.find_by(position: @profile.position + offset)

      swap_positions!(@profile, target) if target
      redirect_to connectivity_hangar_assembly_path(@assembly)
    end

    def destroy
      ssid = @profile.ssid
      @profile.destroy!
      normalize_positions!
      redirect_to connectivity_hangar_assembly_path(@assembly), notice: "#{ssid} removed from this recorder. The saved password remains in Hangar."
    end

    private

    def set_assembly
      @assembly = Assembly.find(params[:assembly_id])
    end

    def ensure_flight_data_recorder
      head :not_found unless @assembly.flight_data_recorder?
    end

    def set_profile
      @profile = @assembly.fdr_wifi_profiles.find(params[:id])
    end

    def selected_or_saved_credential
      if params[:wifi_credential_id].present?
        return WifiCredential.find(params[:wifi_credential_id])
      end

      attributes = params.require(:wifi_credential).permit(:ssid, :security, :password)
      credential = WifiCredential.find_or_initialize_by(ssid: attributes[:ssid].to_s)
      credential.created_by ||= Current.user
      credential.security = attributes[:security]
      credential.password = attributes[:password] if attributes[:password].present? || attributes[:security] == "open" || credential.new_record?
      credential.save
      credential
    end

    def swap_positions!(profile, target)
      return unless target

      now = Time.current
      profile_position = profile.position
      target_position = target.position
      FdrWifiProfile.transaction do
        profile.update_columns(position: -1, updated_at: now)
        target.update_columns(position: profile_position, updated_at: now)
        profile.update_columns(position: target_position, updated_at: now)
      end
    end

    def normalize_positions!
      now = Time.current
      @assembly.fdr_wifi_profiles.ordered.each_with_index do |profile, position|
        profile.update_columns(position: position, updated_at: now) if profile.position != position
      end
    end
  end
end
