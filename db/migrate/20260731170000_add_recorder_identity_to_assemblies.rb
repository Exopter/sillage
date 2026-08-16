class AddRecorderIdentityToAssemblies < ActiveRecord::Migration[8.1]
  class AssemblyRecord < ActiveRecord::Base
    self.table_name = "assemblies"
  end

  class ProfileRecord < ActiveRecord::Base
    self.table_name = "fdr_wifi_profiles"
  end

  def up
    add_column :assemblies, :device_id, :string
    add_column :assemblies, :device_model, :string
    add_column :assemblies, :last_seen_firmware, :string
    add_column :assemblies, :last_seen_at, :datetime

    AssemblyRecord.reset_column_information
    backfill_device_ids

    add_index :assemblies, :device_id, unique: true,
      where: "device_id IS NOT NULL AND device_id != ''"
  end

  def down
    remove_index :assemblies, :device_id
    remove_column :assemblies, :last_seen_at
    remove_column :assemblies, :last_seen_firmware
    remove_column :assemblies, :device_model
    remove_column :assemblies, :device_id
  end

  private

  def backfill_device_ids
    candidates = ProfileRecord
      .where.not(last_provisioned_device_id: [ nil, "" ])
      .order(last_provisioned_at: :desc, updated_at: :desc)
      .to_a

    candidates.group_by { |profile| profile.last_provisioned_device_id.to_s.strip.upcase }.each do |device_id, profiles|
      next unless device_id.match?(/\AEXOFDR-[0-9A-F]{6}\z/)

      assembly_ids = profiles.map(&:assembly_id).uniq
      next unless assembly_ids.one?
      next if AssemblyRecord.where(device_id: device_id).exists?

      AssemblyRecord.where(id: assembly_ids.first, device_id: nil).update_all(device_id: device_id)
    end
  end
end
