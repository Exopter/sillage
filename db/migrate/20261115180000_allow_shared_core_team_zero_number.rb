class AllowSharedCoreTeamZeroNumber < ActiveRecord::Migration[8.1]
  def change
    remove_index :users, :member_number, unique: true
    add_index :users, :member_number, unique: true, where: "member_number <> 0"
    add_check_constraint :users,
      "member_number IS NULL OR (member_number >= 0 AND (member_number <> 0 OR (membership_tier IS NOT NULL AND membership_tier = 'core_team')))",
      name: "users_member_number_range_and_zero_tier"
  end
end
