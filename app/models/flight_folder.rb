class FlightFolder < ApplicationRecord
  VISIBILITIES = %w[private public shared].freeze
  COLORS = %w[field sky aqua amber violet graphite].freeze
  belongs_to :user
  has_many :flights, foreign_key: :folder_id, inverse_of: :folder, dependent: :nullify
  has_many :memberships, class_name: "FlightFolderMembership", dependent: :destroy, inverse_of: :flight_folder
  has_many :members, through: :memberships, source: :user

  normalizes :name, with: ->(name) { name.to_s.strip }
  validates :name, presence: true, length: { maximum: 100 }, uniqueness: { scope: :user_id, case_sensitive: false }
  validates :visibility, inclusion: { in: VISIBILITIES }
  validates :color, inclusion: { in: COLORS }

  scope :ordered, -> { order(Arel.sql("LOWER(flight_folders.name)"), :id) }
  scope :visible_to, ->(user) {
    user ? where(user_id: user.id).or(where(visibility: "public")).or(where(visibility: "shared", id: FlightFolderMembership.where(user_id: user.id).select(:flight_folder_id))) : none
  }
  scope :contributable_to, ->(user) {
    user ? where(user_id: user.id).or(where(visibility: %w[public shared], id: FlightFolderMembership.where(user_id: user.id).select(:flight_folder_id))) : none
  }

  def owned_by?(person)
    person.present? && user_id == person.id
  end

  def visible_to?(person)
    person.present? && (owned_by?(person) || visibility == "public" || (visibility == "shared" && member?(person)))
  end

  def contributable_by?(person)
    owned_by?(person) || (person.present? && visibility != "private" && member?(person))
  end

  private

  def member?(person)
    memberships.loaded? ? memberships.any? { |membership| membership.user_id == person.id } : memberships.exists?(user_id: person.id)
  end
end
