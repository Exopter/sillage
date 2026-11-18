module Imu
  # Wing zero: the residual tilt of the installed IMU when the wing lies flat.
  # It is an installation offset, independent of the calibration reference.
  class Zero
    TILT_LIMIT_DEG = 45

    def self.call(samples, mount_profile:)
      return failure("Select an IMU mounting on the assembly before setting a zero.") unless Mount.installed?(mount_profile)
      return failure("A 2-second still measurement is required.") unless samples.is_a?(Array) && samples.size.between?(10, 100)
      numeric = ->(vector, size) { vector.is_a?(Array) && vector.size == size && vector.all? { |v| v.is_a?(Numeric) && v.finite? } }
      valid = samples.all? { |s| s.is_a?(Hash) && numeric.call(s["quaternion"], 4) && numeric.call(s["accel"], 3) && numeric.call(s["gyro"], 3) }
      return failure("Missing or invalid sensor evidence.") unless valid
      norm = ->(v) { Math.sqrt(v.sum { |x| x * x }) }
      # Stillness comes from rotation rate and attitude spread. An uncalibrated accelerometer can read a few percent
      # off 1 g at rest, so its magnitude is only a coarse guard against handling.
      still = samples.all? { |s| (norm.call(s["accel"]) / 9.80665).between?(0.9, 1.1) && norm.call(s["gyro"]) <= 0.035 }
      return failure("Keep the wing still while the zero is measured.") unless still
      attitudes = samples.map { |s| Mount.attitude(s["quaternion"], mount_profile)&.fetch("quaternion") }
      return failure("Missing or invalid sensor evidence.") if attitudes.any?(&:nil?)
      tilt = Mount.tilt(attitudes)
      steady = attitudes.all? { |q| Mount.angle_deg(Mount.multiply(Mount.tilt([ q ]), Mount.conjugate(tilt))) <= 1 }
      return failure("The attitude moved during the measurement. Keep the wing still and retry.") unless steady
      angle = Mount.angle_deg(tilt)
      if angle > TILT_LIMIT_DEG
        return failure("The IMU is #{angle.round}° from level in this mounting. Check the IMU mounting before setting a zero.")
      end
      offset = Mount.euler(tilt)
      { "passed" => true, "quaternion" => tilt, "roll" => offset["roll"], "pitch" => offset["pitch"], "samples" => samples.size }
    end

    def self.failure(reason)
      { "passed" => false, "reason" => reason }
    end
  end
end
