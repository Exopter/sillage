require "csv"
require "time"
require "stringio"

module FlySight
  module CsvTools
    module_function

    def lines(source)
      return enum_for(__method__, source) unless block_given?

      io = source.respond_to?(:read) ? source : StringIO.new(source.to_s)
      io.rewind
      while (line = io.gets(FlightImports::Limits::MAX_LINE_BYTES + 1))
        raise Error, "FlySight CSV line exceeds 16 KiB." if line.bytesize > FlightImports::Limits::MAX_LINE_BYTES

        yield line.force_encoding("UTF-8").scrub
      end
    end

    def parse_line(line)
      CSV.parse_line(line.to_s, liberal_parsing: true)&.map { |value| value&.strip }
    end

    def numeric(value)
      return nil if value.blank?

      Float(value)
    rescue ArgumentError, TypeError
      value
    end

    def finite_numeric(value)
      number = Float(value, exception: false)
      number if number&.finite?
    end

    def integer(value)
      return nil if value.blank?

      Integer(value)
    rescue ArgumentError, TypeError
      nil
    end

    def timestamp(value)
      return nil if value.blank?

      Time.iso8601(value)
    rescue ArgumentError
      nil
    end

    def normalize_sensor_name(value)
      value.to_s.delete_prefix("$").upcase
    end
  end
end
