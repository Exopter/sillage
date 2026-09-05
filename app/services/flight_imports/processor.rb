module FlightImports
  class Processor
    def initialize(flight_import, error_class:, missing_source_message:)
      @flight_import = flight_import
      @error_class = error_class
      @missing_source_message = missing_source_message
    end

    def call
      @flight_import.with_lock do
        return @flight_import if @flight_import.imported?
        raise @error_class, @missing_source_message unless @flight_import.source_files.attached?

        @flight_import.update!(status: "processing", error_message: nil)
        FlightImport.transaction(requires_new: true) { yield }
      rescue StandardError => error
        # Discard rolled-back associations before saving the failure status.
        @flight_import.reload
        @flight_import.update!(status: "failed", error_message: error.message)
        @flight_import.target_flight&.update!(status: "review")
        @processing_error = error
      end
      raise @processing_error if @processing_error

      @flight_import
    end
  end
end
