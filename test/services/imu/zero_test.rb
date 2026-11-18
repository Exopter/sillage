require "test_helper"

class Imu::ZeroTest < ActiveSupport::TestCase
  LEVEL_TO_SENSOR = [ 0, -Math.sqrt(0.5), -Math.sqrt(0.5), 0 ].freeze # inverse of the ENU to NED conversion

  # Body-to-NED attitude from aerospace angles, independent of the code under test.
  def attitude(roll, pitch, heading)
    r, p, y = [ roll, pitch, heading ].map { |angle| angle * Math::PI / 360 }
    yaw = [ Math.cos(y), 0, 0, Math.sin(y) ]
    Imu::Mount.multiply(Imu::Mount.multiply(yaw, [ Math.cos(p), 0, Math.sin(p), 0 ]), [ Math.cos(r), Math.sin(r), 0, 0 ])
  end

  # Native sample of an upside down IMU whose installed frame has the given body-to-NED attitude.
  def sample(installed)
    gravity = Imu::Mount.multiply(Imu::Mount.multiply(Imu::Mount.conjugate(installed), [ 0, 0, 0, -9.80665 ]), installed).drop(1)
    { "quaternion" => Imu::Mount.multiply(LEVEL_TO_SENSOR, installed), "accel" => gravity, "gyro" => [ 0, 0, 0 ] }
  end

  test "a flat wing yields the installed tilt whatever its heading" do
    tilt = attitude(4, -3, 0)
    [ 0, 50, 181, 300 ].each do |heading|
      installed = Imu::Mount.multiply(attitude(0, 0, heading), tilt)
      zero = Imu::Zero.call(Array.new(20) { sample(installed) }, mount_profile: Imu::Mount::UPSIDE_DOWN)
      assert zero["passed"], zero["reason"]
      assert_in_delta 4, zero["roll"], 1e-6
      assert_in_delta(-3, zero["pitch"], 1e-6)
      zero["quaternion"].zip(tilt) { |actual, expected| assert_in_delta expected, actual, 1e-9 }
      zeroed = Imu::Mount.attitude(sample(installed)["quaternion"], Imu::Mount::UPSIDE_DOWN, zero["quaternion"])
      assert_in_delta 0, zeroed["roll"], 1e-6
      assert_in_delta 0, zeroed["pitch"], 1e-6
      assert_in_delta 0, (zeroed["heading"] - heading + 540) % 360 - 180, 1e-6, "heading is unchanged"
      Imu::Mount.vector(sample(installed)["accel"], Imu::Mount::UPSIDE_DOWN, zero["quaternion"]).zip([ 0, 0, -9.80665 ]) { |actual, expected| assert_in_delta expected, actual, 1e-9 }
    end
  end

  test "a zeroed sample reports the wing attitude of every golden pose" do
    tilt = attitude(-6, 2.5, 0)
    JSON.parse(file_fixture("imu_mount_cases.json").read).each do |pose|
      installed = Imu::Mount.multiply(attitude(*pose.values_at("roll", "pitch", "heading")), tilt)
      result = Imu::Mount.attitude(sample(installed)["quaternion"], Imu::Mount::UPSIDE_DOWN, tilt)
      assert_in_delta pose["roll"], result["roll"], 1e-5
      assert_in_delta pose["pitch"], result["pitch"], 1e-5
      assert_in_delta 0, (result["heading"] - pose["heading"] + 540) % 360 - 180, 1e-5
      readings = Imu::Mount.readings("ATTITUDE", "mount_profile" => Imu::Mount::UPSIDE_DOWN, "mount_zero" => tilt,
        "coordinate_frame" => "sensor_native", "quaternion" => sample(installed)["quaternion"])
      assert_in_delta pose["roll"], readings["rollDeg"], 1e-5
      assert_in_delta pose["pitch"], readings["pitchDeg"], 1e-5
      assert_equal readings, Imu::Mount.readings("ATTITUDE", readings), "a zeroed sample is not transformed again"
    end
  end

  test "a still recorder whose accelerometer reads 3.3 percent high is accepted" do
    # Values captured on ECU-441BF685BEC8, firmware fdr_integrated/69, wing flat, 2026-11-18.
    samples = Array.new(20) do
      { "quaternion" => [ 0.21808446690317987, -0.009582776743296736, 0.9758562711581416, -0.007202341756108375 ],
        "accel" => [ -4.328125, -0.19140625, -9.15625 ], "gyro" => [ 0, 0, 0 ] }
    end
    zero = Imu::Zero.call(samples, mount_profile: Imu::Mount::UPSIDE_DOWN)
    assert zero["passed"], zero["reason"]
    assert_in_delta(-25.2, zero["pitch"], 0.1)
    assert_in_delta 1.1, zero["roll"], 0.1
    shaken = samples.map { |s| s.merge("accel" => [ -4.3, -0.2, -12.0 ]) }
    assert_match(/still/, Imu::Zero.call(shaken, mount_profile: Imu::Mount::UPSIDE_DOWN)["reason"])
  end

  test "motion, a wrong mounting and missing evidence are refused" do
    level = Array.new(20) { sample(attitude(2, 1, 90)) }
    assert_match(/Select an IMU mounting/, Imu::Zero.call(level, mount_profile: Imu::Mount::NATIVE)["reason"])
    assert_match(/2-second/, Imu::Zero.call(level.first(3), mount_profile: Imu::Mount::UPSIDE_DOWN)["reason"])
    assert_match(/still/, Imu::Zero.call(level.map { |s| s.merge("gyro" => [ 0.1, 0, 0 ]) }, mount_profile: Imu::Mount::UPSIDE_DOWN)["reason"])
    moving = level.first(10) + Array.new(10) { sample(attitude(6, 1, 90)) }
    assert_match(/moved/, Imu::Zero.call(moving, mount_profile: Imu::Mount::UPSIDE_DOWN)["reason"])
    upright = Array.new(20) { sample(attitude(180, 0, 0)) }
    assert_match(/180° from level/, Imu::Zero.call(upright, mount_profile: Imu::Mount::UPSIDE_DOWN)["reason"])
    assert_match(/invalid/, Imu::Zero.call(level.map { |s| s.except("quaternion") }, mount_profile: Imu::Mount::UPSIDE_DOWN)["reason"])
  end

  test "the zero is dated on the assembly, keeps the reference digest and follows the mounting" do
    assembly = create_exofdr_assembly
    controller = create_embedded_controller(assembly:, device_id: "ECU-ABC123")
    assembly.update!(imu_mount_profile: Imu::Mount::UPSIDE_DOWN)
    digest = ImuCheck.configuration_digest_for(controller.reload)
    before = Time.current - 1.minute
    zero = Imu::Zero.call(Array.new(20) { sample(attitude(3, -2, 10)) }, mount_profile: Imu::Mount::UPSIDE_DOWN)
    assembly.record_imu_zero!(zero, user: users(:julien), device_id: controller.device_id, firmware: "fdr_integrated/58")
    assert_equal zero["quaternion"], controller.reload.imu_zero
    assert_nil assembly.imu_zero_at(before)
    assert_equal zero["quaternion"], assembly.imu_zero_at(Time.current)
    assert_equal digest, ImuCheck.configuration_digest_for(controller), "setting a zero keeps the calibration reference valid"
    assembly.update!(imu_mount_profile: Imu::Mount::BELLY)
    assert_nil controller.reload.imu_zero, "a zero belongs to the mounting it was measured in"
    assert_equal 2, assembly.imu_zero_history.size
  end
end
