class AddRecordingActivityToFlightImports < ActiveRecord::Migration[8.0]
  def change
    add_column :flight_imports, :activity_classification, :string
    add_column :flight_imports, :activity_summary, :jsonb, null: false, default: {}
    add_column :flight_imports, :included_in_flights_at, :datetime
    add_index :flight_imports, [ :user_id, :activity_classification ]
    add_check_constraint :flight_imports,
      "activity_classification IN ('moving', 'stationary', 'technical', 'needs_review')",
      name: "flight_imports_activity_classification"
  end
end
