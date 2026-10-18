require "openssl"

module FdrIdentity
  class NameProvisioning
    DOMAIN = "exopter/fdr/identity/v1\0".b

    def self.payload(recorder)
      installation = recorder.fdr_board_installations.active.includes(:assembly).first
      key = recorder.fdr_auth_key
      return unless installation && key
      name = installation.assembly.serial_number
      return unless name && name.bytesize <= 29 && Assembly::EXOFDR_SERIAL_PATTERN.match?(name)

      command = [ 1, installation.id, name ].pack("CQ<a32")
      { command: command.unpack1("H*"), signature: OpenSSL::HMAC.hexdigest("SHA256", key, DOMAIN + command) }
    end
  end
end
