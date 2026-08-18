require "test_helper"
require "openssl"

class FdrAuthenticationFlowTest < ActionDispatch::IntegrationTest
  BLE_SESSION_DOMAIN = "exopter/fdr/ble-session/v1\0".b
  USB_SESSION_DOMAIN = "exopter/fdr/usb-session/v1\0".b

  setup do
    @recorder = EmbeddedDevice.create!(assembly: Assembly.create!(name: "Authenticated recorder"), device_id: "EXOFDR-A172E0")
    @key = @recorder.ensure_fdr_auth_key!
    sign_in_as users(:operator)
  end

  test "returns a device-scoped BLE proof without exposing the authentication key" do
    nonce = (0...16).to_a.pack("C*")

    post api_v1_fdr_authentication_path,
      params: { device_id: @recorder.device_id, nonce: nonce.unpack1("H*"), transport: "ble" },
      as: :json

    assert_response :success
    expected = OpenSSL::HMAC.hexdigest("SHA256", @key, BLE_SESSION_DOMAIN + nonce)
    assert_equal expected, response.parsed_body.fetch("proof")
    assert_not_includes response.body, @recorder.fdr_auth_key_encoded
    assert_match "no-store", response.headers["Cache-Control"]
  end


  test "returns domain-separated USB and BLE proofs" do
    nonce = (0...16).to_a.pack("C*")

    post api_v1_fdr_authentication_path,
      params: { device_id: @recorder.device_id, nonce: nonce.unpack1("H*"), transport: "usb" },
      as: :json

    assert_response :success
    usb_proof = response.parsed_body.fetch("proof")
    assert_equal OpenSSL::HMAC.hexdigest("SHA256", @key, USB_SESSION_DOMAIN + nonce), usb_proof
    assert_not_equal OpenSSL::HMAC.hexdigest("SHA256", @key, BLE_SESSION_DOMAIN + nonce), usb_proof
  end

  test "rejects malformed challenges and recorders without a key" do
    post api_v1_fdr_authentication_path,
      params: { device_id: @recorder.device_id, nonce: "abcd", transport: "ble" },
      as: :json
    assert_response :unprocessable_entity

    post api_v1_fdr_authentication_path,
      params: { device_id: @recorder.device_id, nonce: "00" * 16, transport: "usb" },
      as: :json
    assert_response :unprocessable_entity
    assert_equal "The recorder authentication challenge is invalid.", response.parsed_body.fetch("error")

    unclaimed = EmbeddedDevice.create!(device_id: "EXOFDR-ABC123")
    post api_v1_fdr_authentication_path,
      params: { device_id: unclaimed.device_id, nonce: "00" * 16, transport: "usb" },
      as: :json
    assert_response :conflict
  end


  test "rejects an unknown authentication transport" do
    post api_v1_fdr_authentication_path,
      params: { device_id: @recorder.device_id, nonce: "01" * 16, transport: "wifi" },
      as: :json

    assert_response :unprocessable_entity
  end
end
