module Forge
  class FdrWifiProfilesController < BaseController
    before_action :set_fdr
    before_action :set_profile, only: %i[update destroy move]

    def create
      credential = selected_or_saved_credential
      profile = @fdr.fdr_wifi_profiles.build(
        wifi_credential: credential,
        position: @fdr.fdr_wifi_profiles.count,
        enabled: true
      )

      if credential.persisted? && profile.save
        record_activity("wifi_profile_added", ssid: credential.ssid)
        redirect_to connectivity_forge_fdr_path(@fdr), notice: "#{credential.ssid} added to the FDR connectivity configuration."
      else
        errors = credential.errors.full_messages + profile.errors.full_messages
        redirect_to connectivity_forge_fdr_path(@fdr), alert: errors.to_sentence.presence || "The Wi-Fi network could not be saved."
      end
    end

    def update
      if @profile.update(enabled: ActiveModel::Type::Boolean.new.cast(params.require(:enabled)))
        record_activity("wifi_profile_updated", ssid: @profile.ssid, enabled: @profile.enabled)
        redirect_to connectivity_forge_fdr_path(@fdr), notice: "Wi-Fi profile updated."
      else
        redirect_to connectivity_forge_fdr_path(@fdr), alert: @profile.errors.full_messages.to_sentence
      end
    end

    def move
      offset = params.require(:direction) == "up" ? -1 : 1
      target = @fdr.fdr_wifi_profiles.find_by(position: @profile.position + offset)

      if target
        swap_positions!(@profile, target)
        record_activity("wifi_profiles_reordered", ssid: @profile.ssid, position: @profile.reload.position)
      end
      redirect_to connectivity_forge_fdr_path(@fdr)
    end

    def destroy
      ssid = @profile.ssid
      @profile.destroy!
      normalize_positions!
      record_activity("wifi_profile_removed", ssid:)
      redirect_to connectivity_forge_fdr_path(@fdr), notice: "#{ssid} removed from this FDR. The saved credential remains available in Forge."
    end

    private

    def set_fdr
      @fdr = EmbeddedDevice.find(params[:fdr_id])
    end

    def set_profile
      @profile = @fdr.fdr_wifi_profiles.find(params[:id])
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
      @fdr.fdr_wifi_profiles.ordered.each_with_index do |profile, position|
        profile.update_columns(position: position, updated_at: now) if profile.position != position
      end
    end

    def record_activity(event_type, details)
      @fdr.record_activity!(event_type, source: "forge", actor: Current.user, details:)
    end
  end
end
