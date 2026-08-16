module Hangar
  class WifiCredentialsController < BaseController
    def update
      credential = WifiCredential.find(params[:id])
      attributes = params.require(:wifi_credential).permit(:security, :password)
      credential.security = attributes[:security]
      credential.password = attributes[:password] if attributes[:password].present? || attributes[:security] == "open"

      if credential.save
        redirect_back fallback_location: hangar_assemblies_path, notice: "#{credential.ssid} credentials updated. Reapply it to each recorder."
      else
        redirect_back fallback_location: hangar_assemblies_path, alert: credential.errors.full_messages.to_sentence
      end
    end
  end
end
