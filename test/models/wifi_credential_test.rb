require "test_helper"

class WifiCredentialTest < ActiveSupport::TestCase
  setup do
    @user = users(:operator)
    @controller_function = Function.create!(code: "WIFI_FDR_CONTROLLER", name: "Wi-Fi test controller")
    @storage_function = Function.create!(code: "WIFI_FDR_STORAGE", name: "Wi-Fi test storage")
  end

  test "password is encrypted at rest and decrypts only for provisioning" do
    credential = WifiCredential.create!(
      created_by: @user,
      ssid: "EXOPTER-LAB",
      security: "wpa3",
      password: "hangar-secret-123"
    )

    refute_includes credential.password_ciphertext, "hangar-secret-123"
    assert_equal "hangar-secret-123", credential.reload.provisioning_password
    assert_nil credential.password
  end

  test "protected credentials validate password byte length" do
    credential = WifiCredential.new(created_by: @user, ssid: "Short password", security: "wpa2", password: "short")

    assert_not credential.valid?
    assert_includes credential.errors[:password], "must be between 8 and 63 bytes"
  end

  test "one saved credential can be assigned to a reset recorder and a new recorder" do
    credential = WifiCredential.create!(created_by: @user, ssid: "AIRFIELD-HANGAR", security: "wpa2", password: "airfield-secret")
    first = create_fdr("Reset recorder")
    second = create_fdr("Replacement recorder")

    first.fdr_wifi_profiles.create!(wifi_credential: credential, position: 0)
    second.fdr_wifi_profiles.create!(wifi_credential: credential, position: 0)

    assert_equal [ first, second ].sort_by(&:id), credential.embedded_devices.order(:id).to_a
  end

  test "a credential change makes confirmed assignments pending again" do
    credential = WifiCredential.create!(created_by: @user, ssid: "CLUBHOUSE", security: "wpa2", password: "clubhouse-secret")
    profile = create_fdr("Pending recorder").fdr_wifi_profiles.create!(wifi_credential: credential, position: 0)
    confirmed_at = 1.minute.from_now
    profile.update_columns(last_provisioned_at: confirmed_at, updated_at: Time.current)
    credential.update_column(:updated_at, Time.current)

    assert_not profile.reload.pending?

    travel_to 2.minutes.from_now do
      credential.update!(password: "rotated-clubhouse-secret")
      assert profile.reload.pending?
    end
  end

  private

  def create_fdr(name)
    assembly = Assembly.create!(name:).tap do |record|
      Part.create!(function: @controller_function, manufacturer: "Seeed", model: "XIAO ESP32S3", assembly: record)
      Part.create!(function: @storage_function, manufacturer: "SanDisk", model: "High Endurance", assembly: record)
    end
    EmbeddedDevice.create!(assembly:)
  end
end
