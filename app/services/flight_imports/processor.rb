module FlightImports
  class Processor
    def initialize(flight_import, error_class:, missing_source_message:)
      @flight_import = flight_import
      @error_class = error_class
      @missing_source_message = missing_source_message
    end

    def call
      return @flight_import if @flight_import.imported?
      raise @error_class, @missing_source_message unless @flight_import.source_files.attached?

      @flight_import.update!(status: "processing", error_message: nil)
      yield
      @flight_import
    rescue StandardError => error
      @flight_import&.update(status: "failed", error_message: error.message)
      @flight_import&.target_flight&.update(status: "review")
      raise
    end
  end
end
