module Flights
  class TrackProcessing
    Result = Data.define(:points, :analysis, :summary, :quality)

    def initialize(track_points:, sensor_samples:, origin_time: nil, sensor_count: sensor_samples.size)
      @raw_points, @sensors, @origin, @sensor_count = track_points, sensor_samples, origin_time, sensor_count
    end

    def call
      prepared = TrackMetrics.new(@raw_points).prepared_points
      quality = TrackQuality.new(prepared).call
      metrics = TrackMetrics.new(quality.points)
      points = metrics.prepared_points
      # Retain recording bounds even when GPS acquisition or reception is invalid.
      endpoints = [ prepared.first, prepared.last ].compact.map do |point|
        point.slice(:recorded_at, :elapsed_seconds).merge(sensor_type: "TIMELINE")
      end
      analysis = FlightAnalysis.new(track_points: points, sensor_samples: @sensors.chain(endpoints), origin_time: @origin).call
      summary = metrics.summary(points, sensor_count: @sensor_count, bounds: analysis.bounds).merge(
        sample_count: @raw_points.size, duration_seconds: analysis.duration_seconds,
        min_altitude_m: analysis.altitude_min, max_altitude_m: analysis.altitude_max,
        altitude_loss_m: analysis.altitude_min && analysis.altitude_max ? analysis.altitude_max - analysis.altitude_min : nil
      )
      summary[:started_at] = @origin if @origin
      summary[:ended_at] = @origin + analysis.timeline_end if @origin
      Result.new(points: points, analysis: analysis, summary: summary, quality: quality)
    end
  end
end
