class ClarifyControllerAndAssetIdentifiers < ActiveRecord::Migration[8.1]
  class AssetIdentifierRecord < ActiveRecord::Base
    self.table_name = "asset_identifiers"
  end

  class AssemblyRecord < ActiveRecord::Base
    self.table_name = "assemblies"
  end

  class PartRecord < ActiveRecord::Base
    self.table_name = "parts"
  end

  class EmbeddedControllerRecord < ActiveRecord::Base
    self.table_name = "embedded_controllers"
  end

  class FdrWifiProfileRecord < ActiveRecord::Base
    self.table_name = "fdr_wifi_profiles"
  end

  class FlightImportRecord < ActiveRecord::Base
    self.table_name = "flight_imports"
  end

  class BuildRecord < ActiveRecord::Base
    self.table_name = "builds"
  end

  class FlightRecord < ActiveRecord::Base
    self.table_name = "flights"
  end

  class DeviceActivityRecord < ActiveRecord::Base
    self.table_name = "device_activities"
  end

  class SignalPresenceRecord < ActiveRecord::Base
    self.table_name = "signal_presences"
  end

  ASSET_ID_MAXIMUM = 9_999

  def up
    rewrite_identifiers(source_asset_digits: 6, asset_digits: 4, controller_prefix: "ECU")
  end

  def down
    rewrite_identifiers(source_asset_digits: 4, asset_digits: 6, controller_prefix: "EXOFDR")
  end

  private

  def rewrite_identifiers(source_asset_digits:, asset_digits:, controller_prefix:)
    ensure_asset_id_capacity!
    asset_mapping = asset_id_mapping(source_asset_digits, asset_digits)
    rewrite_current_asset_ids(asset_mapping)
    rewrite_controller_columns(controller_prefix)
    rewrite_json_columns(asset_mapping, controller_prefix)
  end

  def ensure_asset_id_capacity!
    maximum = AssetIdentifierRecord.maximum(:id).to_i
    return if maximum <= ASSET_ID_MAXIMUM

    raise ActiveRecord::MigrationError,
      "Cannot use four-digit internal Asset IDs: asset identifier #{maximum} already exceeds #{ASSET_ID_MAXIMUM}."
  end

  def asset_id_mapping(source_digits, digits)
    AssetIdentifierRecord.order(:id).to_h do |identifier|
      [ format("EXO-%0#{source_digits}d", identifier.id), format("EXO-%0#{digits}d", identifier.id) ]
    end
  end

  def rewrite_current_asset_ids(asset_mapping)
    AssetIdentifierRecord.find_each do |identifier|
      record_class = case identifier.identifiable_type
      when "Assembly" then AssemblyRecord
      when "Part" then PartRecord
      else next
      end
      record = record_class.find_by(id: identifier.identifiable_id)
      next unless record

      rewritten = asset_mapping.fetch(record.internal_number)
      record.update_columns(internal_number: rewritten)
    end
  end

  def rewrite_controller_columns(controller_prefix)
    rewrite_controller_column(EmbeddedControllerRecord, :device_id, controller_prefix)
    rewrite_controller_column(FdrWifiProfileRecord, :last_provisioned_device_id, controller_prefix)
    rewrite_controller_column(FlightImportRecord, :device_id, controller_prefix)
  end

  def rewrite_controller_column(record_class, column, controller_prefix)
    record_class.where.not(column => [ nil, "" ]).find_each do |record|
      current = record.public_send(column)
      rewritten = rewrite_controller_id(current, controller_prefix)
      record.update_columns(column => rewritten) if rewritten != current
    end
  end

  def rewrite_json_columns(asset_mapping, controller_prefix)
    rewrite_json_column(BuildRecord, :assembly_snapshot, asset_mapping, controller_prefix)
    rewrite_json_column(FlightRecord, :configuration_snapshot, asset_mapping, controller_prefix)
    rewrite_json_column(DeviceActivityRecord, :details, asset_mapping, controller_prefix)
    rewrite_json_column(SignalPresenceRecord, :status, asset_mapping, controller_prefix)
  end

  def rewrite_json_column(record_class, column, asset_mapping, controller_prefix)
    record_class.find_each do |record|
      current = record.public_send(column)
      rewritten = rewrite_value(current, asset_mapping, controller_prefix)
      record.update_columns(column => rewritten) if rewritten != current
    end
  end

  def rewrite_value(value, asset_mapping, controller_prefix)
    case value
    when Array
      value.map { |item| rewrite_value(item, asset_mapping, controller_prefix) }
    when Hash
      value.to_h do |key, item|
        [ key, rewrite_value(item, asset_mapping, controller_prefix) ]
      end
    when String
      rewrite_controller_id(asset_mapping.fetch(value, value), controller_prefix)
    else
      value
    end
  end

  def rewrite_controller_id(value, controller_prefix)
    source_prefix = controller_prefix == "ECU" ? "EXOFDR" : "ECU"
    value.gsub(/\b#{source_prefix}-([0-9A-F]{6})\b/, "#{controller_prefix}-\\1")
  end
end
