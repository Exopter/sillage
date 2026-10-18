require "csv"

module Signal
  class RadioHistory
    COLUMNS = %w[recorded_at elapsed_seconds ground_dbm air_dbm ground_noise_dbm air_noise_dbm
      ground_margin_db air_margin_db tx_free_percent rx_errors corrected_packets air_telemetry_age_ms
      rssi remote_rssi noise remote_noise].freeze

    attr_reader :session

    def initialize(session, samples: nil)
      @session = session
      @samples = samples
    end

    def self.for_flight(flight)
      sessions = flight.signal_sessions.where.not(status: "discarded").recent
      samples = Diagnostics.samples(sessions, type: "RADIO").group_by(&:first)
      sessions.map { |session| new(session, samples: samples.fetch(session.id, [])) }
    end

    def self.ground_signal_for(flight, histories: nil)
      return [] unless flight.started_at

      (histories || for_flight(flight)).flat_map do |history|
        offset = history.session.started_at - flight.started_at
        history.rows.map do |row|
          { t: (offset + row[:elapsed_seconds]).round(6), ground_dbm: row[:ground_dbm], session_id: history.session.id }
        end
      end.sort_by { |row| row[:t] }
    end

    def self.received_strength(value)
      value / 1.9 - 127 if value.is_a?(Integer) && (0..254).cover?(value)
    end

    def rows
      @rows ||= (@samples || Diagnostics.samples(SignalSession.where(id: @session.id), type: "RADIO")).filter_map do |_id, sample|
        at = Time.iso8601(sample["recorded_at"].to_s) rescue nil
        next unless at

        raw = sample["readings"].to_h
        ground, air, noise, remote_noise = %w[rssi remoteRssi noise remoteNoise].map { |key| self.class.received_strength(raw[key]) }
        {
          recorded_at: at.iso8601(6), elapsed_seconds: (at - @session.started_at).round(6),
          ground_dbm: ground, air_dbm: air, ground_noise_dbm: noise, air_noise_dbm: remote_noise,
          ground_margin_db: ground && noise ? ground - noise : nil,
          air_margin_db: air && remote_noise ? air - remote_noise : nil,
          tx_free_percent: integer(raw["txBufferPercent"], 0..100),
          rx_errors: integer(raw["rxErrors"], 0..65535), corrected_packets: integer(raw["fixed"], 0..65535),
          air_telemetry_age_ms: integer(raw["airTelemetryAgeMs"], 0..2**53),
          rssi: integer(raw["rssi"], 0..255), remote_rssi: integer(raw["remoteRssi"], 0..255),
          noise: integer(raw["noise"], 0..255), remote_noise: integer(raw["remoteNoise"], 0..255)
        }
      end.sort_by { |row| row[:elapsed_seconds] }
    end

    def duration
      [ (@session.ended_at || Time.current) - @session.started_at, rows.last&.fetch(:elapsed_seconds).to_f ].max
    end

    def to_csv
      CSV.generate do |csv|
        csv << COLUMNS
        rows.each { |row| csv << COLUMNS.map { |key| row[key.to_sym] } }
      end
    end

    private

    def integer(value, range)
      value if value.is_a?(Integer) && range.cover?(value)
    end
  end
end
