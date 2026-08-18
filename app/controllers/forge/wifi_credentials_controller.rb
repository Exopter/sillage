module Forge
  class WifiCredentialsController < BaseController
    def update
      credential = WifiCredential.find(params[:id])
      attributes = params.require(:wifi_credential).permit(:security, :password)
      credential.security = attributes[:security]
      credential.password = attributes[:password] if attributes[:password].present? || attributes[:security] == "open"

      if credential.save
        credential.embedded_devices.find_each do |fdr|
          fdr.record_activity!(
            "wifi_credential_updated",
            source: "forge",
            actor: Current.user,
            details: { ssid: credential.ssid }
          )
        end
        redirect_back fallback_location: forge_fdrs_path, notice: "#{credential.ssid} credentials updated. Reapply them to each FDR."
      else
        redirect_back fallback_location: forge_fdrs_path, alert: credential.errors.full_messages.to_sentence
      end
    end
  end
end
