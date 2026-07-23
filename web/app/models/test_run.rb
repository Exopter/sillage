class TestRun < ApplicationRecord
  OUTCOMES = %w[passed failed blocked].freeze

  belongs_to :build
  belongs_to :part, optional: true
  belongs_to :operator, class_name: "User"
  belongs_to :validated_by, class_name: "User", optional: true
  has_many_attached :artifacts

  after_create_commit :lock_build

  validates :uuid, :recipe_id, :recipe_version, :recipe_sha256, :ingestion_sha256, :ran_at, presence: true
  validates :uuid, uniqueness: true
  validates :recipe_sha256, :ingestion_sha256,
    format: { with: Build::SHA256_PATTERN, message: "must be a SHA-256 hash" }
  validates :outcome, inclusion: { in: OUTCOMES }
  validate :target_part_belongs_to_build
  validate :validation_requires_pass

  scope :recent, -> { order(ran_at: :desc) }

  def validated?
    validated_at.present?
  end

  def validate_by!(reviewer, note:)
    raise ActiveRecord::RecordInvalid, self unless outcome == "passed" && reviewer.admin?

    update!(validated_at: Time.current, validated_by: reviewer, validation_note: note)
  end

  private

  def lock_build
    build.lock!
  end

  def target_part_belongs_to_build
    return if part.nil? || build&.contains_part?(part)

    errors.add(:part, "is not present in the build snapshot")
  end

  def validation_requires_pass
    return if validated_at.blank?

    errors.add(:validated_at, "requires a passed result") unless outcome == "passed"
    errors.add(:validated_by, "must be an administrator") unless validated_by&.admin?
  end
end
