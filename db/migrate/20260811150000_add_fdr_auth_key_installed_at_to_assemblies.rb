class AddFdrAuthKeyInstalledAtToAssemblies < ActiveRecord::Migration[8.1]
  def change
    add_column :assemblies, :fdr_auth_key_installed_at, :datetime
  end
end
