module Flights
  class SampleTrack
    # Segment endpoints and phase boundaries survive decimation, so a quality
    # break can never become a continuous line at a smaller payload size.
    def self.call(points, limit:, boundaries: [])
      return points if points.size <= limit

      required = [ 0, points.size - 1 ]
      points.each_cons(2).with_index do |(a, b), index|
        required.concat([ index, index + 1 ]) if a[:segment] != b[:segment]
      end
      boundaries.compact.each do |elapsed|
        index = points.bsearch_index { |point| point[:elapsed_seconds] >= elapsed }
        required.concat([ index - 1, index ].select { |i| i >= 0 }) if index
      end
      required = required.uniq.sort
      if required.size > limit
        # With more interruptions than the display budget, omit whole portions
        # while retaining segment identities; never connect across an omission.
        indexes = (0...limit).map { |index| (index * (required.size - 1).to_f / (limit - 1)).round }
        return required.values_at(*indexes).map { |index| points[index] }
      end
      step = (points.size.to_f / [ limit - required.size, 1 ].max).ceil
      required.concat((0...points.size).step(step).to_a).uniq.sort.map { |index| points[index] }
    end
  end
end
