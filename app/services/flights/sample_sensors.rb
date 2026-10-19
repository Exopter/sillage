module Flights
  class SampleSensors
    # Rank narrow rows for each sensor type, then load readings only for
    # the selected IDs. Preserve each stream's first and last measurements.
    def self.call(flight, limit_per_type:, counts: flight.sensor_samples.group(:sensor_type).count)
      raise ArgumentError, "At least two samples are required" unless limit_per_type.is_a?(Integer) && limit_per_type >= 2

      selections = counts.map do |sensor_type, count|
        scope = flight.sensor_samples.where(sensor_type: sensor_type)
        next scope.select(:id).limit(limit_per_type).arel if count <= limit_per_type

        step = ((count - 1).to_f / (limit_per_type - 1)).ceil
        ranked = Arel::Table.new(:ranked)
        rows = scope.select(:id, Arel.sql("ROW_NUMBER() OVER (ORDER BY elapsed_seconds, recorded_at, id) AS n"))
        modulo = Arel::Nodes::NamedFunction.new("MOD", [ ranked[:n] - 1, Arel::Nodes.build_quoted(step) ])
        ranked.project(ranked[:id]).from(rows.arel.as("ranked"))
          .where(modulo.eq(0).or(ranked[:n].eq(count))).take(limit_per_type)
      end
      return [] if selections.empty?

      # Explicit bounds keep PostgreSQL from estimating hundreds of thousands
      # of selected rows and scanning the entire readings table for the join.
      union = selections.map { |query| Arel::Nodes::Grouping.new(query.ast) }
        .reduce { |left, right| Arel::Nodes::UnionAll.new(left, right) }
      selected = Arel::Table.new(:selected)
      samples = SensorSample.arel_table
      query = samples.project(samples[Arel.star]).with(Arel::Nodes::Cte.new("selected", union, materialized: true))
        .join(selected).on(samples[:id].eq(selected[:id]))
        .order(samples[:sensor_type], samples[:elapsed_seconds], samples[:recorded_at], samples[:id])
      SensorSample.find_by_sql(query)
    end
  end
end
