class IdentifierSequence < ApplicationRecord
  def self.next_value!(name)
    quoted_name = connection.quote(name)
    connection.exec_query(<<~SQL.squish).rows.first.first.to_i
      INSERT INTO identifier_sequences (name, last_value, created_at, updated_at)
      VALUES (#{quoted_name}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO UPDATE
      SET last_value = identifier_sequences.last_value + 1, updated_at = CURRENT_TIMESTAMP
      RETURNING last_value
    SQL
  end

  def self.reserve_through!(name, value)
    quoted_value = connection.quote(Integer(value.to_s, 10))
    connection.execute(<<~SQL.squish)
      INSERT INTO identifier_sequences (name, last_value, created_at, updated_at)
      VALUES (#{connection.quote(name)}, #{quoted_value}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO UPDATE
      SET last_value = GREATEST(identifier_sequences.last_value, EXCLUDED.last_value),
          updated_at = CURRENT_TIMESTAMP
    SQL
  end
end
