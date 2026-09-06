module Flights
  module SampleOrder
    def self.sort(records)
      previous = nil
      ordered = records.all? do |record|
        key = yield(record)
        in_order = previous.nil? || previous <= key
        previous = key
        in_order
      end
      return records if ordered

      # Preserve acquisition order when timestamps tie.
      records.sort_by.with_index { |record, index| [ yield(record), index ] }
    end
  end
end
