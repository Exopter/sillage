module Signal
  # Combine retained batches into bounded bulk inserts, within the caller's
  # checkpoint transaction. Raw batches remain the source of truth.
  class SampleWriter
    ROW_LIMIT = 1000

    def initialize
      @tracks = []
      @sensors = []
    end

    def track_points(rows)
      append(@tracks, rows, TrackPoint)
    end

    def sensor_samples(rows)
      append(@sensors, rows, SensorSample)
    end

    def flush
      insert(@tracks, TrackPoint)
      insert(@sensors, SensorSample)
    end

    private

    def append(buffer, rows, model)
      rows.each do |row|
        buffer << row
        insert(buffer, model) if buffer.size >= ROW_LIMIT
      end
    end

    def insert(buffer, model)
      return if buffer.empty?

      model.insert_all!(buffer)
      buffer.clear
    end
  end
end
