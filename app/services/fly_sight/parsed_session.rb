module FlySight
  ParsedSession = Data.define(:format, :metadata, :track_points, :sensor_samples) do
    def close
      track_points.close if track_points.respond_to?(:close)
      sensor_samples.close if sensor_samples.respond_to?(:close)
    end

    def started_at
      track_points.first&.fetch(:recorded_at, nil)
    end
  end
end
