class AddFlightClubMembershipToUsers < ActiveRecord::Migration[8.1]
  def change
    change_table :users, bulk: true do |t|
      t.string :first_name
      t.string :last_name
      t.string :membership_tier
      t.integer :member_number
      t.datetime :membership_started_at
      t.datetime :membership_welcomed_at
    end

    add_index :users, :member_number, unique: true
    add_index :users, :membership_tier
  end
end
