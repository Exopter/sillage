module FlightImports
  class SourceBuilder
    class << self
      def create!(uploaded_files, user:, import_type:, error_class:, empty_message:, aircraft: nil, target_flight: nil, content_type:)
        files = Array(uploaded_files).compact_blank
        raise error_class, empty_message if files.empty?
        raise error_class, "Sign in before importing a flight recording." unless user
        attributes = {
          source_filename: files.map { |file| filename_for(file) }.join(", "),
          status: "pending",
          import_type:,
          aircraft: aircraft || target_flight&.aircraft,
          target_flight:
        }
        flight_import = if target_flight
          target_flight.with_lock do
            raise error_class, "The target flight is not accessible." unless target_flight.visible_to?(user)
            raise error_class, "This flight cannot accept a recording." unless target_flight.accepts_recording_import?
            if FlightImport.exists?(target_flight:, status: %w[pending processing])
              raise error_class, "A recording is already being imported for this flight."
            end

            user.flight_imports.create!(attributes)
          end
        else
          user.flight_imports.create!(attributes)
        end
        attach_files(flight_import, files, content_type:)
        flight_import
      rescue StandardError => error
        flight_import&.update(status: "failed", error_message: error.message)
        raise
      end

      private

      def attach_files(flight_import, files, content_type:)
        files.each do |file|
          file.rewind if file.respond_to?(:rewind)
          flight_import.source_files.attach(
            io: file,
            filename: filename_for(file),
            content_type: content_type.call(file)
          )
          file.rewind if file.respond_to?(:rewind)
        end
      end

      def filename_for(file)
        file.respond_to?(:original_filename) ? file.original_filename : File.basename(file.path.to_s)
      end
    end
  end
end
