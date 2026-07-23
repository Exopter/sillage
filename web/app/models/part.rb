class Part < ApplicationRecord
  STATES = %w[available installed quarantined retired].freeze

  belongs_to :function
  belongs_to :assembly, optional: true
  has_many :test_runs, dependent: :restrict_with_error

  before_validation :synchronize_installation_state

  normalizes :internal_number, with: ->(number) { number.to_s.strip.upcase }
  normalizes :serial_number, with: ->(number) { number.to_s.strip.presence }

  validates :internal_number, :model, presence: true
  validates :internal_number, uniqueness: true
  validates :serial_number, uniqueness: { scope: :manufacturer }, allow_blank: true
  validates :state, inclusion: { in: STATES }
  validate :non_serviceable_part_is_not_installed

  scope :ordered, -> { order(:internal_number) }
  scope :available, -> { where(state: "available", assembly_id: nil) }

  def self.next_internal_number
    highest = pluck(:internal_number).filter_map { |value| value[/\APART-(\d+)\z/, 1]&.to_i }.max || 0
    format("PART-%06d", highest + 1)
  end

  def display_name
    [ manufacturer, model ].compact_blank.join(" ")
  end

  def install_in!(target_assembly)
    raise ActiveRecord::RecordInvalid, self unless state == "available" && assembly.nil?

    update!(assembly: target_assembly)
  end

  def remove_from_assembly!
    update!(assembly: nil)
  end

  private

  def synchronize_installation_state
    if assembly_id.present?
      self.state = "installed" if state.in?(%w[available installed])
    elsif state == "installed"
      self.state = "available"
    end
  end

  def non_serviceable_part_is_not_installed
    return unless assembly_id.present? && state.in?(%w[quarantined retired])

    errors.add(:state, "cannot be installed while #{state}")
  end
end
