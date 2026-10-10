module Imu
  # POC bench limits. These checks measure consistency, not flight certification.
  class Assessment
    LIMITS_VERSION = "imu-poc-4".freeze

    def self.call(samples, firmware: nil)
      return { "passed" => false, "reason" => "A continuous 15-second reference is required." } unless samples.is_a?(Array) && samples.size.between?(100, 400)
      numeric = ->(v) { v.is_a?(Numeric) && v.finite? }
      valid = samples.all? do |s|
        s.is_a?(Hash) && %w[t roll pitch heading_accuracy quality_age].all? { |key| numeric.call(s[key]) } &&
          %w[accel gyro mag].all? { |key| s[key].is_a?(Array) && s[key].size == 3 && s[key].all?(&numeric) } &&
          s["accuracy"].is_a?(Array) && s["accuracy"].size == 4 && s["accuracy"].all? { |v| v.is_a?(Integer) && v.between?(0, 3) }
      end
      return { "passed" => false, "reason" => "Missing or invalid sensor evidence." } unless valid
      span = samples.last["t"] - samples.first["t"]
      continuous = span.between?(15_000, 45_000) && samples.each_cons(2).all? { |a, b| (b["t"] - a["t"]).between?(1, 300) }
      norm = ->(v) { Math.sqrt(v.sum { |x| x * x }) }
      g = samples.map { |s| norm.call(s["accel"]) / 9.80665 }
      gyro = samples.map { |s| norm.call(s["gyro"]) }
      gyro_mean = (0..2).map { |axis| samples.sum { |s| s["gyro"][axis] } / samples.size }
      gyro_std = (0..2).map { |axis| Math.sqrt(samples.sum { |s| (s["gyro"][axis] - gyro_mean[axis])**2 } / samples.size) }
      gyro_stable = gyro_mean.all? { |v| v.abs <= 0.005 } && gyro_std.all? { |v| v <= 0.005 }
      magnetic = samples.map { |s| norm.call(s["mag"]) }
      accuracy_min = (0..3).map { |index| samples.map { |s| s["accuracy"][index] }.min }
      # Operator policy: low gyro accuracy is advisory, not a missing-data waiver.
      required_quality = [ 0, 2, 3 ]
      warnings = accuracy_min[1] < 2 ? [ "Gyroscope manufacturer status #{accuracy_min[1]}/3. Non-blocking; measured checks remain required." ] : []
      low_quality = %w[Accelerometer Gyroscope Magnetometer Orientation].each_with_index.filter_map { |name, index| "#{name} #{accuracy_min[index]}/3" if required_quality.include?(index) && accuracy_min[index] < 2 }
      quality = samples.all? { |s| required_quality.all? { |index| s["accuracy"][index] >= 2 } && s["quality_age"].between?(0, 1500) && s["heading_accuracy"].between?(0, 10) }
      stationary = g.all? { |v| v.between?(0.97, 1.03) } && gyro.max <= 0.035
      level = samples.all? { |s| s["roll"].abs <= 2 && s["pitch"].abs <= 2 }
      gravity_consistent = samples.all? do |sample|
        roll, pitch = sample.values_at("roll", "pitch").map { |v| v * Math::PI / 180 }
        gravity = [ Math.sin(pitch), Math.sin(roll) * Math.cos(pitch), Math.cos(roll) * Math.cos(pitch) ]
        cosine = gravity.zip(sample["accel"]).sum { |a, b| a * b } / norm.call(sample["accel"])
        cosine.finite? && cosine >= Math.cos(5 * Math::PI / 180)
      end
      magnetic_ok = magnetic.all? { |v| v.between?(20, 80) } && magnetic.max - magnetic.min <= 10
      reason = if !continuous then "Acquisition was interrupted. Repeat the check."
      elsif low_quality.any? then "#{low_quality.join(' · ')}. Required quality: at least 2/3."
      elsif !quality then "Quality reports must be fresh and heading uncertainty at most 10 degrees."
      elsif !stationary then "Keep the enclosure still. Acceleration or rotation is outside the reference limits."
      elsif !gyro_stable then "Gyroscope rest bias or noise exceeds 0.005 rad/s per axis. Keep the enclosure still and repeat the measurement."
      elsif !level then "Place the enclosure on the verified level reference."
      elsif !gravity_consistent then "Acceleration and attitude disagree on the gravity direction."
      elsif !magnetic_ok then "Magnetic field is outside the POC reference limits. Move magnetic objects away."
      else "Static reference checks passed."
      end
      { "passed" => continuous && quality && stationary && gyro_stable && level && gravity_consistent && magnetic_ok, "reason" => reason,
        "duration_ms" => span, "samples" => samples.size, "g_mean" => g.sum / g.size,
        "roll_mean" => samples.sum { |s| s["roll"] } / samples.size,
        "pitch_mean" => samples.sum { |s| s["pitch"] } / samples.size,
        "magnetic_mean_ut" => magnetic.sum / magnetic.size, "gyro_max_rad_s" => gyro.max,
        "gyro_mean_rad_s" => gyro_mean, "gyro_std_rad_s" => gyro_std,
        "gyro_status_role" => "warning", "warnings" => warnings, "firmware" => firmware,
        "heading_accuracy_max_deg" => samples.map { |s| s["heading_accuracy"] }.max,
        "accuracy_min" => accuracy_min,
        "limits_version" => LIMITS_VERSION }
    end
  end
end
