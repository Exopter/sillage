class CreateFeedbacks < ActiveRecord::Migration[8.1]
  def change
    create_table :feedbacks do |t|
      t.references :user, null: false, foreign_key: true
      t.string :category, null: false
      t.string :status, null: false, default: "new"
      t.text :description, null: false
      t.string :page_path
      t.timestamps
    end
    add_index :feedbacks, :created_at
  end
end
