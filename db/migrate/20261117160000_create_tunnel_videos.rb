class CreateTunnelVideos < ActiveRecord::Migration[8.1]
  def change
    create_table :tunnel_videos do |t|
      t.references :flight, foreign_key: true
      t.string :media_token, null: false
      t.string :filename, null: false
      t.string :source_url, null: false
      t.string :camera, null: false
      t.integer :clip_number
      t.datetime :timeslot_at
      t.datetime :recorded_at, null: false
      t.float :duration_seconds
      t.string :status, null: false, default: "pending"
      t.string :match_method
      t.text :error_message
      t.timestamps

      t.index :media_token, unique: true
      t.index :recorded_at
      t.index :status
    end
  end
end
