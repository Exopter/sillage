module Imu
  class Mount
    NATIVE = "sensor_native".freeze
    BELLY = "wingsuit_belly_pocket_v1".freeze
    UPSIDE_DOWN = "upside_down_v1".freeze
    LABELS = { NATIVE => "None (native sensor axes)", BELLY => "Wingsuit belly pocket mount", UPSIDE_DOWN => "Upside down mount" }.freeze
    DESCRIPTIONS = { NATIVE => "+X forward · +Y left · +Z up", BELLY => "+Y forward · +X left · +Z down",
      UPSIDE_DOWN => "+X forward · +Y right · +Z down" }.freeze
    # Body FRD to sensor rotation of each installed mounting, scalar first.
    BODY_TO_SENSOR = { BELLY => [ Math.sqrt(0.5), 0, 0, Math.sqrt(0.5) ], UPSIDE_DOWN => [ 1, 0, 0, 0 ] }.freeze

    def self.installed?(profile)
      BODY_TO_SENSOR.key?(profile)
    end

    def self.description(profile)
      DESCRIPTIONS.fetch(profile, DESCRIPTIONS.fetch(NATIVE))
    end

    def self.vector(vector, profile)
      profile == BELLY ? [ vector[1], -vector[0], vector[2] ] : vector
    end

    def self.multiply(a, b)
      w, x, y, z = a
      v, i, j, k = b
      [ w*v-x*i-y*j-z*k, w*i+x*v+y*k-z*j, w*j-x*k+y*v+z*i, w*k+x*j-y*i+z*v ]
    end

    def self.attitude(quaternion, profile = BELLY)
      return unless quaternion.is_a?(Array) && quaternion.size == 4 && quaternion.all? { |v| v.is_a?(Numeric) && v.finite? }
      length = Math.sqrt(quaternion.sum { |v| v*v })
      return unless length.between?(0.5, 1.5)
      h = Math.sqrt(0.5)
      q = multiply(multiply([ 0, h, h, 0 ], quaternion.map { |v| v / length }), BODY_TO_SENSOR.fetch(profile))
      w, x, y, z = q
      degrees = 180 / Math::PI
      { "quaternion" => q, "roll" => Math.atan2(2*(w*x+y*z), 1-2*(x*x+y*y)) * degrees,
        "pitch" => Math.asin((2*(w*y-z*x)).clamp(-1, 1)) * degrees,
        "heading" => (Math.atan2(2*(w*z+x*y), 1-2*(y*y+z*z)) * degrees) % 360 }
    end

    def self.reference(sample, profile)
      return sample unless installed?(profile)
      orientation = attitude(sample["quaternion"], profile)
      return unless orientation
      sample.merge(orientation).merge("accel" => vector(sample["accel"], profile),
        "gyro" => vector(sample["gyro"], profile), "mag" => vector(sample["mag"], profile))
    end

    # Derived Flight values use the profile captured with each sample, never today's setting.
    def self.readings(type, source)
      profile = source["mount_profile"]
      return source unless installed?(profile) && (source["coordinate_frame"] || source["coordinateFrame"]) == "sensor_native"
      result = source.deep_dup
      case type
      when "ATTITUDE", "IMU:rotation_vector"
        q = type == "ATTITUDE" ? source["quaternion"] : source.values_at("w", "x", "y", "z")
        converted = attitude(q, profile)
        return source unless converted
        result.merge!("rollDeg" => converted["roll"], "pitchDeg" => converted["pitch"], "yawDeg" => converted["heading"], "quaternion" => converted["quaternion"])
        if type == "IMU:rotation_vector"
          result.merge!(%w[w x y z].zip(converted["quaternion"]).to_h)
        else
          result.merge!("rollSpeed" => source["pitchSpeed"], "pitchSpeed" => source["rollSpeed"] && -source["rollSpeed"]) if profile == BELLY
        end
      when "HIGHRES_IMU"
        %w[acceleration angularVelocity magneticField].each { |key| result[key] = vector(source[key], profile) if source[key].is_a?(Array) && source[key].size == 3 }
      when "IMU:accelerometer", "IMU:gyroscope_calibrated", "IMU:magnetic_field_calibrated"
        axes = source.values_at("x", "y", "z")
        return source unless axes.all? { |value| value.is_a?(Numeric) && value.finite? }
        result.merge!(%w[x y z].zip(vector(axes, profile)).to_h)
      else
        return source
      end
      result.merge("coordinate_frame" => "body_frd_ned", "coordinateFrame" => "body_frd_ned")
    end
  end
end
