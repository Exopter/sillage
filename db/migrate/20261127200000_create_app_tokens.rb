class CreateAppTokens < ActiveRecord::Migration[8.1]
  def change
    create_table :app_tokens do |t|
      t.references :user, null: false, foreign_key: true
      t.string :token_digest, null: false
      t.string :device_name
      t.datetime :last_used_at
      t.timestamps
    end
    add_index :app_tokens, :token_digest, unique: true
  end
end
