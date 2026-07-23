class CreateHangarAndForge < ActiveRecord::Migration[8.1]
  def change
    create_table :functions do |t|
      t.string :code, null: false
      t.string :name, null: false
      t.text :description

      t.timestamps
    end
    add_index :functions, :code, unique: true

    create_table :assemblies do |t|
      t.string :code, null: false
      t.string :name, null: false
      t.references :parent, foreign_key: { to_table: :assemblies }
      t.text :notes

      t.timestamps
    end
    add_index :assemblies, :code, unique: true

    create_table :parts do |t|
      t.string :internal_number, null: false
      t.references :function, null: false, foreign_key: true
      t.references :assembly, foreign_key: true
      t.string :manufacturer
      t.string :model, null: false
      t.string :serial_number
      t.string :state, null: false, default: "available"
      t.text :notes

      t.timestamps
    end
    add_index :parts, :internal_number, unique: true
    add_index :parts, [ :manufacturer, :serial_number ], unique: true,
      where: "serial_number IS NOT NULL AND serial_number != ''"

    create_table :builds do |t|
      t.string :code, null: false
      t.references :assembly, null: false, foreign_key: true
      t.references :previous_build, foreign_key: { to_table: :builds }
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      t.json :assembly_snapshot, null: false, default: {}
      t.string :source_revision
      t.boolean :source_dirty, null: false, default: false
      t.text :source_diff
      t.string :arduino_core_version, null: false, default: "3.3.10"
      t.string :firmware_sha256
      t.json :notion_references, null: false, default: []
      t.text :notes
      t.datetime :locked_at

      t.timestamps
    end
    add_index :builds, :code, unique: true

    create_table :test_runs do |t|
      t.string :uuid, null: false
      t.references :build, null: false, foreign_key: true
      t.references :part, foreign_key: true
      t.references :operator, null: false, foreign_key: { to_table: :users }
      t.string :recipe_id, null: false
      t.string :recipe_version, null: false
      t.string :recipe_sha256, null: false
      t.string :outcome, null: false
      t.json :measurements, null: false, default: {}
      t.json :artifact_manifest, null: false, default: []
      t.string :ingestion_sha256, null: false
      t.datetime :ran_at, null: false
      t.text :notes
      t.datetime :validated_at
      t.references :validated_by, foreign_key: { to_table: :users }
      t.text :validation_note

      t.timestamps
    end
    add_index :test_runs, :uuid, unique: true
    add_index :test_runs, :outcome
    add_index :test_runs, :validated_at

    add_column :users, :bench_token_digest, :string
    add_column :users, :bench_token_created_at, :datetime
    add_index :users, :bench_token_digest, unique: true
  end
end
