require "digest"
require "openssl"

class FdrDeviceRequestAuthentication
  DOMAIN = "exopter/fdr/wifi-upload/v1\0".b
  CLOCK_SKEW = 60.seconds
  SIGNATURE_PATTERN = /\A[0-9a-f]{64}\z/

  def initialize(request:, body:, operation:)
    @request = request
    @body = body.b
    @operation = operation.to_s
  end

  def authenticate
    recorder = EmbeddedDevice.find_by(device_id: device_id)
    return unless recorder && timestamp_valid? && signature_valid?(recorder)

    recorder
  rescue EmbeddedDevice::AuthenticationKeyError
    nil
  end

  private

  def device_id
    value = @request.headers["X-FDR-Device-ID"]
    return unless FdrIdentity::DeviceId.valid?(value)

    FdrIdentity::DeviceId.normalize(value)
  end

  def sent_at
    Integer(@request.headers["X-FDR-Sent-At"])
  end

  def timestamp_valid?
    (Time.current - Time.at(sent_at, in: "UTC")).abs <= CLOCK_SKEW
  rescue ArgumentError, TypeError
    false
  end

  def signature_valid?(recorder)
    received = @request.headers["X-FDR-Signature"].to_s.downcase
    return false unless received.match?(SIGNATURE_PATTERN)

    key = recorder.fdr_auth_key
    return false unless key&.bytesize == EmbeddedDevice::FDR_AUTH_KEY_BYTES

    canonical = [ device_id, @operation, sent_at, Digest::SHA256.hexdigest(@body) ].join("\n")
    expected = OpenSSL::HMAC.hexdigest("SHA256", key, DOMAIN + canonical)
    ActiveSupport::SecurityUtils.secure_compare(received, expected)
  end
end
