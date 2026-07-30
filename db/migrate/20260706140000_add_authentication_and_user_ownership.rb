class AddAuthenticationAndUserOwnership < ActiveRecord::Migration[8.1]
  DEFAULT_ADMIN_EMAIL = "julien@exopter.com"

  def up
    create_table :users do |t|
      t.string :email_address, null: false
      t.string :password_digest
      t.string :role, null: false, default: "user"
      t.datetime :invitation_sent_at
      t.datetime :invitation_accepted_at
      t.datetime :disabled_at
      t.text :otp_secret_ciphertext
      t.datetime :otp_enabled_at
      t.datetime :otp_last_verified_at

      t.timestamps
    end
    add_index :users, :email_address, unique: true
    add_index :users, :role
    add_index :users, :disabled_at

    create_table :sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.string :ip_address
      t.string :user_agent
      t.datetime :otp_verified_at

      t.timestamps
    end

    add_reference :flight_imports, :user, foreign_key: true
    create_default_admin!
    backfill_flight_import_owner!
    change_column_null :flight_imports, :user_id, false
  end

  def down
    remove_reference :flight_imports, :user, foreign_key: true
    drop_table :sessions
    drop_table :users
  end

  private

  def create_default_admin!
    now = quote(Time.current)
    email = quote(DEFAULT_ADMIN_EMAIL)

    execute <<~SQL.squish
      INSERT INTO users (email_address, role, invitation_sent_at, created_at, updated_at)
      SELECT #{email}, 'admin', #{now}, #{now}, #{now}
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE email_address = #{email})
    SQL
  end

  def backfill_flight_import_owner!
    default_user_id = select_value("SELECT id FROM users WHERE email_address = #{quote(DEFAULT_ADMIN_EMAIL)}")
    execute "UPDATE flight_imports SET user_id = #{default_user_id} WHERE user_id IS NULL"
  end
end
