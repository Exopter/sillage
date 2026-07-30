class AddSourceDiffSha256ToBuilds < ActiveRecord::Migration[8.1]
  def change
    add_column :builds, :source_diff_sha256, :string
  end
end
