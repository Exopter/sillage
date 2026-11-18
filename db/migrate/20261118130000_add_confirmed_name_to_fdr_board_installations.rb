class AddConfirmedNameToFdrBoardInstallations < ActiveRecord::Migration[8.1]
  def change
    add_column :fdr_board_installations, :confirmed_name, :string
  end
end
