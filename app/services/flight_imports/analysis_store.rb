require "tempfile"
require "json"
require "time"

module FlightImports
  # Owns temporary analysis sequences and closes them on success or failure.
  class AnalysisStore
    def self.open
      store = new
      yield store
    ensure
      store&.close
    end

    def self.sort(records, &key)
      return records.sort_by(&key) if records.is_a?(Sequence)

      records.sort_by.with_index { |record, index| [ key.call(record), index ] }
    end

    def initialize
      @sequences = []
    end

    def sequence(records = [])
      Sequence.new(self).tap do |sequence|
        @sequences << sequence
        records.each { |record| sequence << record }
      end
    end

    def release(sequence)
      @sequences.delete(sequence)
    end

    def close
      @sequences.dup.each(&:close)
    end

    # Disk-backed random access keeps the existing phase algorithms usable. Sorting
    # merges fixed-size runs; neither samples nor index offsets accumulate in RAM.
    class Sequence
      include Enumerable
      RUN_SIZE = 1_000
      CACHE_SIZE = 512
      attr_reader :size, :store
      alias_method :length, :size

      def initialize(store)
        @store = store
        @data = Tempfile.new("flight-analysis", binmode: true)
        @index = Tempfile.new("flight-analysis-index", binmode: true)
        @size = 0
        @cache = {}
        @reading = false
      end

      def <<(record)
        record = record.merge(recorded_at: record[:recorded_at].iso8601(9)) if record.is_a?(Hash) && record[:recorded_at]
        if @reading
          @data.seek(0, IO::SEEK_END)
          @index.seek(0, IO::SEEK_END)
          @reading = false
        end
        @index.write([ @data.pos ].pack("Q<"))
        @data.write(JSON.generate(record, allow_nan: true), "\n")
        @size += 1
        self
      end

      def [](index, count = nil)
        return Array.new([ count, size - index ].min) { |offset| self[index + offset] } if count && index < size
        return [] if count
        index += size if index.negative?
        return unless index.between?(0, size - 1)
        return @cache[index] if @cache.key?(index)

        @reading = true
        @index.seek(index * 8)
        @data.seek(@index.read(8).unpack1("Q<"))
        record = decode(@data.gets)
        @cache.shift if @cache.size >= CACHE_SIZE
        @cache[index] = record
      end

      def first = self[0]
      def last = self[-1]
      def empty? = size.zero?
      def values_at(*indices) = indices.map { |index| self[index] }

      def each
        return enum_for(__method__) unless block_given?

        @data.flush
        File.open(@data.path, "rb") { |file| file.each_line { |line| yield decode(line) } }
        self
      end

      def map
        return enum_for(__method__) unless block_given?
        store.sequence.tap { |output| each { |record| output << yield(record) } }
      end

      def select
        return enum_for(__method__) unless block_given?
        store.sequence.tap { |output| each { |record| output << record if yield(record) } }
      end

      def filter_map
        return enum_for(__method__) unless block_given?
        store.sequence.tap { |output| each { |record| value = yield(record); output << value if value } }
      end

      def sort_by(&key)
        return self if each_cons(2).all? { |left, right| (key.call(left) <=> key.call(right)) <= 0 }

        levels = []
        each_slice(RUN_SIZE) do |slice|
          run = store.sequence(slice.sort_by.with_index { |record, index| [ key.call(record), index ] })
          level = 0
          while levels[level]
            run = merge(levels[level], run, key)
            levels[level] = nil
            level += 1
          end
          levels[level] = run
        end
        levels.reverse.compact.reduce { |left, right| merge(left, right, key) } || store.sequence
      end

      def close
        @data.close!
        @index.close!
        @cache.clear
        store.release(self)
      end

      private

      def decode(line)
        record = JSON.parse(line, allow_nan: true)
        if record.is_a?(Hash)
          record.transform_keys!(&:to_sym)
          record[:recorded_at] = Time.iso8601(record[:recorded_at]) if record[:recorded_at]
        end
        record
      end

      def merge(left, right, key)
        output = store.sequence
        streams = [ left.each, right.each ]
        heads = streams.map(&:next)
        while heads.any?
          side = heads[0].nil? ? 1 : heads[1].nil? ? 0 : ((key.call(heads[0]) <=> key.call(heads[1])) <= 0 ? 0 : 1)
          output << heads[side]
          heads[side] = begin
            streams[side].next
          rescue StopIteration
            nil
          end
        end
        left.close
        right.close
        output
      end
    end
  end
end
