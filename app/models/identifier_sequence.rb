class IdentifierSequence < ApplicationRecord
  def self.next_value!(name)
    quoted_name = connection.quote(name)
    connection.execute(<<~SQL.squish)
      INSERT INTO identifier_sequences (name, last_value, created_at, updated_at)
      VALUES (#{quoted_name}, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO NOTHING
    SQL
    value = connection.select_value(<<~SQL.squish)
      UPDATE identifier_sequences
      SET last_value = last_value + 1, updated_at = CURRENT_TIMESTAMP
      WHERE name = #{quoted_name}
      RETURNING last_value
    SQL
    value.to_i
  end
end
