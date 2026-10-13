class FlightFolderMembership < ApplicationRecord
  belongs_to :flight_folder, inverse_of: :memberships
  belongs_to :user
  validates :user_id, uniqueness: { scope: :flight_folder_id }
end
