module ExoFdr
  # Classifies existing sources without reimporting or removing flights, samples,
  # attachments, operator annotations or manual inclusion decisions.
  class BackfillActivity
    def call(scope: FlightImport.all)
      counts = Hash.new(0)
      scope.where(import_type: "exofdr", status: "imported", activity_classification: nil).find_each do |flight_import|
        flight_import.with_lock do
          next if flight_import.activity_classification.present?

          summary = assess(flight_import)
          attributes = { activity_classification: summary.fetch("classification"), activity_summary: summary }
          if flight_import.flights.any? { |flight| flight.notes.present? || flight.signal_sessions.exists? || flight.video.attached? || flight.video_upload.attached? }
            attributes[:included_in_flights_at] = flight_import.included_in_flights_at || Time.current
          end
          flight_import.update!(attributes)
          counts[flight_import.activity_classification] += 1
        end
      end
      counts
    end

    private

    def assess(flight_import)
      raise ActiveStorage::FileNotFoundError unless flight_import.source_files.attached?

      segments = flight_import.source_files.map do |source|
        assessment = ActivityAssessment.new
        source.blob.open do |io|
          decoder = Decoder.new(io, on_record: ->(record) { assessment.observe(record) })
          decoder.each_record { |_record| }
          assessment.result(stats: decoder.stats).merge("boot_id" => decoder.header.fetch("boot_id"), "filename" => source.filename.to_s)
        end
      end
      RecordingActivity.new(flight_import).summarize(segments)
    rescue ActiveStorage::FileNotFoundError, Errno::ENOENT
      { "version" => ActivityAssessment::VERSION, "classification" => "needs_review", "reason" => "source_missing" }
    rescue ActiveStorage::IntegrityError, ExoFdr::Error
      { "version" => ActivityAssessment::VERSION, "classification" => "needs_review", "reason" => "source_unreadable" }
    end
  end
end
