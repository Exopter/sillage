class UnifyAssetIdentifiers < ActiveRecord::Migration[8.1]
  class AssetIdentifierRecord < ActiveRecord::Base
    self.table_name = "asset_identifiers"
  end

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
    create_table :asset_identifiers do |t|
      t.string :identifiable_type, null: false
      t.integer :identifiable_id, null: false
      t.timestamps
    end
    add_index :asset_identifiers, %i[identifiable_type identifiable_id], unique: true,
      name: "index_asset_identifiers_on_identifiable"

    number_mapping = allocate_existing_assets
    rewrite_snapshots(number_mapping)
  end

  def down
    number_mapping = restore_existing_assets
    rewrite_snapshots(number_mapping)
    drop_table :asset_identifiers
  end

  private

  def allocate_existing_assets
    number_mapping = allocation_plan(all_asset_rows).to_h do |asset|
      identifier = AssetIdentifierRecord.create!(
        id: asset.fetch(:asset_number),
        identifiable_type: asset.fetch(:type),
        identifiable_id: asset.fetch(:id),
        created_at: asset.fetch(:created_at),
        updated_at: asset.fetch(:updated_at)
      )
      new_number = format("EXO-%06d", identifier.id)
      asset.fetch(:record)&.update_all(internal_number: new_number)
      [ asset.fetch(:internal_number), new_number ]
    end

    connection.reset_pk_sequence!("asset_identifiers") if connection.respond_to?(:reset_pk_sequence!)
    number_mapping
  end

  def allocation_plan(assets)
    requested_numbers = assets.to_h do |asset|
      type, number = legacy_identity(asset.fetch(:internal_number))
      unless type == asset.fetch(:type) && number == asset.fetch(:id)
        raise ActiveRecord::MigrationError,
          "Asset #{asset.fetch(:internal_number)} does not match its #{asset.fetch(:type)} record."
      end

      [ number, true ]
    end

    used_numbers = {}
    fallback_number = 1

    assets.sort_by { |asset| [ asset.fetch(:type) == "Part" ? 0 : 1, asset.fetch(:id) ] }.map do |asset|
      requested_number = asset.fetch(:id)
      asset_number = if used_numbers[requested_number]
        fallback_number += 1 while requested_numbers[fallback_number] || used_numbers[fallback_number]
        fallback_number
      else
        requested_number
      end
      used_numbers[asset_number] = true

      asset.merge(asset_number:)
    end
  end

  def all_asset_rows
    current_rows = asset_rows
    current_numbers = current_rows.index_by { |asset| asset.fetch(:internal_number) }
    historical_rows = historical_internal_numbers.filter_map do |internal_number|
      next if current_numbers.key?(internal_number)

      type, id = legacy_identity(internal_number)
      {
        type:,
        id:,
        internal_number:,
        created_at: Time.current,
        updated_at: Time.current,
        record: nil
      }
    end

    current_rows + historical_rows
  end

  def restore_existing_assets
    AssetIdentifierRecord.order(:id).to_h do |identifier|
      record_class, prefix = record_class_and_prefix(identifier.identifiable_type)
      record = record_class.where(id: identifier.identifiable_id)
      restored_number = format("%s-%06d", prefix, identifier.identifiable_id)
      record.update_all(internal_number: restored_number) if record.exists?
      [ format("EXO-%06d", identifier.id), restored_number ]
    end
  end

  def asset_rows
    rows_for(AssemblyRecord, "Assembly") + rows_for(PartRecord, "Part")
  end

  def rows_for(record_class, type)
    record_class.order(:id).map do |record|
      {
        type:,
        id: record.id,
        internal_number: record.internal_number,
        created_at: record.created_at,
        updated_at: record.updated_at,
        record: record_class.where(id: record.id)
      }
    end
  end

  def historical_internal_numbers
    snapshots = BuildRecord.pluck(:assembly_snapshot) + FlightRecord.pluck(:configuration_snapshot)
    snapshots.flat_map { |snapshot| collect_internal_numbers(snapshot) }.compact.uniq
  end

  def collect_internal_numbers(value)
    case value
    when Array
      value.flat_map { |item| collect_internal_numbers(item) }
    when Hash
      [ value["internal_number"], *value.values.flat_map { |item| collect_internal_numbers(item) } ]
    else
      []
    end
  end

  def legacy_identity(number)
    match = /\A(ASY|PART)-(\d{6,})\z/.match(number)
    unless match
      raise ActiveRecord::MigrationError,
        "Cannot convert historical asset ID #{number.inspect} to the global EXO sequence."
    end

    [ match[1] == "ASY" ? "Assembly" : "Part", match[2].to_i ]
  end

  def record_class_and_prefix(type)
    case type
    when "Assembly" then [ AssemblyRecord, "ASY" ]
    when "Part" then [ PartRecord, "PART" ]
    else raise ActiveRecord::IrreversibleMigration, "Unknown asset type: #{type}"
    end
  end

  def rewrite_snapshots(number_mapping)
    BuildRecord.find_each do |build|
      snapshot = rewrite_value(build.assembly_snapshot, number_mapping)
      build.update_columns(assembly_snapshot: snapshot)
    end

    FlightRecord.find_each do |flight|
      snapshot = rewrite_value(flight.configuration_snapshot, number_mapping)
      flight.update_columns(configuration_snapshot: snapshot)
    end
  end

  def rewrite_value(value, number_mapping)
    case value
    when Array
      value.map { |item| rewrite_value(item, number_mapping) }
    when Hash
      rewritten = value.to_h do |key, item|
        [ key, rewrite_value(item, number_mapping) ]
      end
      current_number = value["internal_number"]
      rewritten["internal_number"] = number_mapping.fetch(current_number, current_number) if current_number
      rewritten
    else
      value
    end
  end
end
