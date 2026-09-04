class GenerateExofdrSerialNumbers < ActiveRecord::Migration[8.1]
  SEQUENCE_NAME = "exofdr_serial_number"

  def up
    create_table :identifier_sequences do |t|
      t.string :name, null: false
      t.bigint :last_value, null: false, default: 0
      t.timestamps
    end
    add_index :identifier_sequences, :name, unique: true

    initial_value = select_value(<<~SQL.squish).to_i
      SELECT COALESCE(MAX(CAST(SUBSTRING(serial_number FROM '^FDR-([0-9]{4})$') AS bigint)), 0)
      FROM assemblies
    SQL
    now = connection.quote(Time.current)
    execute <<~SQL.squish
      INSERT INTO identifier_sequences (name, last_value, created_at, updated_at)
      VALUES (#{connection.quote(SEQUENCE_NAME)}, #{initial_value}, #{now}, #{now})
    SQL

    select_values(<<~SQL.squish).each do |assembly_id|
      SELECT assemblies.id
      FROM assemblies
      INNER JOIN hardware_definitions ON hardware_definitions.id = assemblies.hardware_definition_id
      WHERE hardware_definitions.product_name = 'ExoFDR'
        AND hardware_definitions.family_code = 'FDR'
        AND (assemblies.serial_number IS NULL OR assemblies.serial_number = '')
      ORDER BY assemblies.id
    SQL
      serial_number = format("FDR-%04d", next_value)
      execute <<~SQL.squish
        UPDATE assemblies
        SET serial_number = #{connection.quote(serial_number)}, updated_at = CURRENT_TIMESTAMP
        WHERE id = #{connection.quote(assembly_id)}
      SQL
    end
  end

  def down
    drop_table :identifier_sequences
  end

  private

  def next_value
    select_value(<<~SQL.squish).to_i
      UPDATE identifier_sequences
      SET last_value = last_value + 1, updated_at = CURRENT_TIMESTAMP
      WHERE name = #{connection.quote(SEQUENCE_NAME)}
      RETURNING last_value
    SQL
  end
end
