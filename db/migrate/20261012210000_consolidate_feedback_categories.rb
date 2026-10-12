class ConsolidateFeedbackCategories < ActiveRecord::Migration[8.1]
  def up
    execute "UPDATE feedbacks SET category = 'idea' WHERE category = 'question'"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Legacy questions have been merged into ideas."
  end
end
