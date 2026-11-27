# Lite recorders linked to an account from the mobile app.
class CreateRecorderOwnerships < ActiveRecord::Migration[8.1]
  def change
    create_table :recorder_ownerships do |t|
      t.references :embedded_controller, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.datetime :linked_at, null: false
      t.datetime :unlinked_at
      t.timestamps
    end
    add_index :recorder_ownerships, :embedded_controller_id, unique: true, where: "unlinked_at IS NULL",
      name: "one_owner_per_recorder"

    create_table :recorder_claims do |t|
      t.references :embedded_controller, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.references :recorder_ownership, foreign_key: true
      t.string :token, null: false
      t.text :key_ciphertext
      t.datetime :expires_at, null: false
      t.datetime :confirmed_at
      t.timestamps
    end
    add_index :recorder_claims, :token, unique: true

    create_table :lite_recording_uploads do |t|
      t.references :embedded_controller, null: false, foreign_key: true
      t.references :recorder_ownership, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.references :flight_import, foreign_key: true
      t.bigint :file_id, null: false
      t.bigint :byte_size, null: false
      t.string :sha256, null: false
      t.string :status, null: false, default: "queued"
      t.timestamps
    end
    add_index :lite_recording_uploads, %i[embedded_controller_id sha256], unique: true,
      name: "one_upload_per_recorder_digest"
  end
end
