class AlignAssetIdentifiers < ActiveRecord::Migration[8.1]
  class AssemblyRecord < ActiveRecord::Base
    self.table_name = "assemblies"
  end

  class PartRecord < ActiveRecord::Base
    self.table_name = "parts"
  end

  class BuildRecord < ActiveRecord::Base
    self.table_name = "builds"
  end

  class FlightRecord < ActiveRecord::Base
    self.table_name = "flights"
  end

  def up
    assembly_rows = AssemblyRecord.pluck(:id, :code)
    part_rows = PartRecord.pluck(:id, :internal_number)
    assembly_numbers = assembly_rows.to_h do |id, old_number|
      [ old_number, format("ASY-%06d", id) ]
    end
    part_numbers = part_rows.to_h do |id, old_number|
      [ old_number, format("PART-%06d", id) ]
    end

    change_column_null :parts, :internal_number, true
    rename_column :assemblies, :code, :internal_number
    rename_index :assemblies, "index_assemblies_on_code", "index_assemblies_on_internal_number" if
      index_name_exists?(:assemblies, "index_assemblies_on_code")
    change_column_null :assemblies, :internal_number, true

    AssemblyRecord.reset_column_information
    PartRecord.reset_column_information

    assembly_rows.each { |id, _| AssemblyRecord.where(id:).update_all(internal_number: "MIGRATING-ASY-#{id}") }
    part_rows.each { |id, _| PartRecord.where(id:).update_all(internal_number: "MIGRATING-PART-#{id}") }
    assembly_rows.each do |id, old_number|
      AssemblyRecord.where(id:).update_all(internal_number: assembly_numbers.fetch(old_number))
    end
    part_rows.each do |id, old_number|
      PartRecord.where(id:).update_all(internal_number: part_numbers.fetch(old_number))
    end

    rewrite_snapshots(assembly_numbers, part_numbers)
  end

  def down
    assembly_numbers = AssemblyRecord.pluck(:internal_number).index_with(&:itself)
    rewrite_snapshots_for_rollback(assembly_numbers)

    change_column_null :assemblies, :internal_number, false
    rename_column :assemblies, :internal_number, :code
    rename_index :assemblies, "index_assemblies_on_internal_number", "index_assemblies_on_code" if
      index_name_exists?(:assemblies, "index_assemblies_on_internal_number")
    change_column_null :parts, :internal_number, false
  end

  private

  def rewrite_snapshots(assembly_numbers, part_numbers)
    BuildRecord.find_each do |build|
      snapshot = rewrite_value(build.assembly_snapshot, assembly_numbers, part_numbers)
      build.update_columns(assembly_snapshot: snapshot)
    end

    FlightRecord.find_each do |flight|
      snapshot = rewrite_value(flight.configuration_snapshot, assembly_numbers, part_numbers)
      flight.update_columns(configuration_snapshot: snapshot)
    end
  end

  def rewrite_snapshots_for_rollback(assembly_numbers)
    BuildRecord.find_each do |build|
      snapshot = restore_assembly_code(build.assembly_snapshot, assembly_numbers)
      build.update_columns(assembly_snapshot: snapshot)
    end

    FlightRecord.find_each do |flight|
      snapshot = restore_assembly_code(flight.configuration_snapshot, assembly_numbers)
      flight.update_columns(configuration_snapshot: snapshot)
    end
  end

  def rewrite_value(value, assembly_numbers, part_numbers)
    case value
    when Array
      value.map { |item| rewrite_value(item, assembly_numbers, part_numbers) }
    when Hash
      rewritten = value.to_h do |key, item|
        [ key, rewrite_value(item, assembly_numbers, part_numbers) ]
      end

      if assembly_numbers.key?(value["code"])
        rewritten.delete("code")
        rewritten["internal_number"] = assembly_numbers.fetch(value["code"])
      elsif part_numbers.key?(value["internal_number"])
        rewritten["internal_number"] = part_numbers.fetch(value["internal_number"])
      end

      rewritten
    else
      value
    end
  end

  def restore_assembly_code(value, assembly_numbers)
    case value
    when Array
      value.map { |item| restore_assembly_code(item, assembly_numbers) }
    when Hash
      restored = value.to_h do |key, item|
        [ key, restore_assembly_code(item, assembly_numbers) ]
      end

      if assembly_numbers.key?(value["internal_number"])
        restored.delete("internal_number")
        restored["code"] = value["internal_number"]
      end

      restored
    else
      value
    end
  end
end
