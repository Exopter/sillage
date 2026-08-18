module FlightImports
  class SourceBuilder
    class << self
      def create!(uploaded_files, user:, import_type:, error_class:, empty_message:, aircraft: nil, target_flight: nil, content_type:)
        files = Array(uploaded_files).compact_blank
        raise error_class, empty_message if files.empty?
        raise error_class, "Sign in before importing a flight recording." unless user

        flight_import = user.flight_imports.create!(
          source_filename: files.map { |file| filename_for(file) }.join(", "),
          status: "pending",
          import_type:,
          aircraft: aircraft || target_flight&.aircraft,
          target_flight:
        )
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
