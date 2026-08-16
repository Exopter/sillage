class Function < ApplicationRecord
  has_many :parts, dependent: :restrict_with_error

  normalizes :code, with: ->(code) { code.to_s.strip.upcase.gsub(/[^A-Z0-9]+/, "_").gsub(/\A_|_\z/, "") }
  before_validation :assign_code, on: :create

  validates :code, :name, presence: true
  validates :code, uniqueness: true

  scope :ordered, -> { order(:name) }

  private

  def assign_code
    self.code = name if code.blank?
  end
end
