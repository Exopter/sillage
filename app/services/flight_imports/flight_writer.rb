module FlightImports
  class FlightWriter
    TRACK_ATTRIBUTES = %i[
      recorded_at elapsed_seconds lat lon altitude_m vel_n_mps vel_e_mps vel_d_mps
      horizontal_accuracy_m vertical_accuracy_m speed_accuracy_mps heading_deg course_accuracy_deg
      gps_fix satellite_count horizontal_speed_mps vertical_speed_mps glide_ratio distance_from_start_m
    ].freeze
    SENSOR_ATTRIBUTES = %i[sensor_type recorded_at elapsed_seconds readings].freeze
    INSERT_BATCH_SIZE = 1_000

    def initialize(flight_import:, name:, started_at:, track_points:, sensor_samples:, replace_target: false)
      @flight_import = flight_import
      @name = name
      @started_at = started_at
      @track_points = track_points
      @sensor_samples = sensor_samples
      @replace_target = replace_target
    end

    def call
      metrics = Flights::TrackMetrics.new(@track_points)
      points = metrics.prepared_points
      analysis = Flights::FlightAnalysis.new(track_points: points, sensor_samples: @sensor_samples).call
      bounds = analysis.bounds
      summary = metrics.summary(points, sensor_count: @sensor_samples.size, bounds:)
        .merge(analysis_summary(analysis))
      flight = persist_flight(summary.compact, bounds)

      insert_records(TrackPoint, flight, points, TRACK_ATTRIBUTES)
      insert_records(SensorSample, flight, @sensor_samples, SENSOR_ATTRIBUTES)
      flight.capture_configuration!
      flight
    end

    private

    def persist_flight(summary, bounds)
      attributes = {
        name: @name,
        user: @flight_import.user,
        aircraft: @flight_import.aircraft,
        status: "analysed",
        started_at: @started_at
      }.merge(summary, bounds)

      if @replace_target && @flight_import.target_flight
        @flight_import.target_flight.tap do |target|
          target.track_points.delete_all
          target.sensor_samples.delete_all
          target.update!(attributes.merge(flight_import: @flight_import))
        end
      else
        @flight_import.flights.create!(attributes)
      end
    end

    def analysis_summary(analysis)
      {
        min_altitude_m: analysis.altitude_min,
        max_altitude_m: analysis.altitude_max,
        altitude_loss_m: altitude_loss(analysis),
        duration_seconds: analysis.duration_seconds
      }
    end

    def altitude_loss(analysis)
      return unless analysis.altitude_min && analysis.altitude_max

      analysis.altitude_max - analysis.altitude_min
    end

    def insert_records(model, flight, records, attributes)
      now = Time.current
      records.each_slice(INSERT_BATCH_SIZE) do |slice|
        model.insert_all!(slice.map do |record|
          record.slice(*attributes).merge(flight_id: flight.id, created_at: now, updated_at: now)
        end)
      end
    end
  end
end
