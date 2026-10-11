require "test_helper"

class Imu::MountTest < ActiveSupport::TestCase
  test "golden body poses and signed vectors match the installation" do
    JSON.parse(file_fixture("imu_mount_cases.json").read).each do |pose|
      result = Imu::Mount.attitude(pose.fetch("quaternion"))
      assert_in_delta pose["roll"], result["roll"], 1e-5
      assert_in_delta pose["pitch"], result["pitch"], 1e-5
      assert_in_delta 0, (result["heading"] - pose["heading"] + 540) % 360 - 180, 1e-5
    end
    assert_equal [ 2, -1, 3 ], Imu::Mount.vector([ 1, 2, 3 ], Imu::Mount::BELLY)
    assert_nil Imu::Mount.attitude([ 0, 0, 0, 0 ])
  end

  test "radio and SD derive the same installed attitude without rewriting evidence" do
    metadata = { "mount_profile" => Imu::Mount::BELLY, "coordinate_frame" => "sensor_native" }
    radio = metadata.merge("quaternion" => [ 0, 0, 1, 0 ], "rollDeg" => 180, "pitchDeg" => 0, "yawDeg" => 270)
    sd = metadata.merge("w" => 0, "x" => 0, "y" => 1, "z" => 0)
    before = Marshal.dump([ radio, sd ])
    radio_result = SensorSample.new(sensor_type: "ATTITUDE", readings: radio).installed_readings
    sd_result = SensorSample.new(sensor_type: "IMU:rotation_vector", readings: sd).installed_readings
    assert_equal radio_result.values_at("rollDeg", "pitchDeg", "yawDeg"), sd_result.values_at("rollDeg", "pitchDeg", "yawDeg")
    assert_in_delta 0, radio_result["rollDeg"], 1e-6
    assert_equal "body_frd_ned", radio_result["coordinateFrame"]
    assert_equal before, Marshal.dump([ radio, sd ])
    assert_equal radio_result, Imu::Mount.readings("ATTITUDE", radio_result)
    assert_equal radio.except("mount_profile"), Imu::Mount.readings("ATTITUDE", radio.except("mount_profile")), "historical samples do not inherit a new mounting"
  end

  test "mount changes are dated, assembly-specific and change reference configuration" do
    assembly = create_exofdr_assembly
    other = create_exofdr_assembly
    controller = create_embedded_controller(assembly:, device_id: "ECU-ABC123")
    old_digest = ImuCheck.configuration_digest_for(controller)
    before = Time.current
    travel 1.second do
      assembly.update!(imu_mount_profile: Imu::Mount::BELLY)
      assert_equal Imu::Mount::BELLY, controller.reload.imu_mount_profile
      assert_equal Imu::Mount::NATIVE, assembly.imu_mount_profile_at(before)
      assert_equal Imu::Mount::BELLY, assembly.imu_mount_profile_at(Time.current)
      assert_not_equal old_digest, ImuCheck.configuration_digest_for(controller)
    end
    assert_equal Imu::Mount::NATIVE, other.reload.imu_mount_profile
    assert_equal 1, assembly.imu_mount_history.size
    assembly.update!(notes: "Unchanged mounting")
    assert_equal 1, assembly.imu_mount_history.size
    belly_digest = ImuCheck.configuration_digest_for(controller.reload)
    travel 2.seconds do
      assembly.update!(imu_mount_profile: Imu::Mount::NATIVE)
    end
    travel 3.seconds do
      assembly.update!(imu_mount_profile: Imu::Mount::BELLY)
    end
    assert_not_equal belly_digest, ImuCheck.configuration_digest_for(controller.reload),
      "returning to a previous mounting must not revive its old calibration reference"
  end
end
