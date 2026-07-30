class Function < ApplicationRecord
  has_many :parts, dependent: :restrict_with_error

  normalizes :code, with: ->(code) { code.to_s.strip.upcase.gsub(/[^A-Z0-9]+/, "_").gsub(/\A_|_\z/, "") }

  validates :code, :name, presence: true
  validates :code, uniqueness: true

  scope :ordered, -> { order(:name) }
end
