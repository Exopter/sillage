# frozen_string_literal: true

module Sillage
  module EnvironmentFile
    module_function

    def load(path, only: nil)
      return unless File.file?(path)

      File.foreach(path) do |line|
        key, value = parse(line)
        next if key.nil? || (only && !only.include?(key)) || ENV.key?(key)

        ENV[key] = value
      end
    end

    def parse(line)
      line = line.strip
      return if line.empty? || line.start_with?("#")

      line = line.sub(/\Aexport\s+/, "")
      key, value = line.split("=", 2)
      key = key&.strip
      return unless key&.match?(/\A[A-Za-z_][A-Za-z0-9_]*\z/) && value

      value = value.strip
      quote = value[0]
      value = value[1...-1] if [ "'", '"' ].include?(quote) && value.end_with?(quote)

      [ key, value ]
    end
  end
end
