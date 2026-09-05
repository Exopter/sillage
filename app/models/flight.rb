class Flight < ApplicationRecord
  STATUSES = %w[preparation live waiting_for_recording processing analysed review].freeze
  VIDEO_PROCESSING_STATUSES = %w[empty processing ready failed].freeze
  VIDEO_UPLOAD_EXTENSIONS = %w[.avi .m4v .mkv .mov .mp4 .webm].freeze
  LOCATION_SOURCES = %w[manual openstreetmap].freeze

  belongs_to :user
  belongs_to :flight_import, optional: true, inverse_of: :flights
  belongs_to :aircraft, optional: true
  has_many :track_points, dependent: :delete_all, inverse_of: :flight
  has_many :sensor_samples, dependent: :delete_all, inverse_of: :flight
  has_many :signal_sessions, dependent: :restrict_with_error
  has_many :operator_events, dependent: :delete_all
  has_one_attached :video_upload
  has_one_attached :video

  before_validation :assign_code

  validates :code, :name, presence: true
  validates :code, uniqueness: true
  validates :status, inclusion: { in: STATUSES }
  validates :video_processing_status, inclusion: { in: VIDEO_PROCESSING_STATUSES }
  validates :location_source, inclusion: { in: LOCATION_SOURCES }, allow_nil: true
  validates :video_exit_offset_seconds, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :video_duration_seconds, numericality: { greater_than: 0 }, allow_nil: true
  validate :video_upload_must_be_video

  scope :recent, -> { order(started_at: :desc, created_at: :desc) }

  STATUSES.each do |value|
    define_method("#{value}?") { status == value }
  end

  def bounds
    [ exit_at || started_at, opening_at, landing_at || ended_at ].compact
  end

  def display_started_at
    started_at || (created_at unless flight_import)
  end

  def display_aircraft
    aircraft&.display_name || "To complete"
  end

  def display_location
    location.presence || "Not recorded"
  end

  def capture_configuration!(replace: false, at: started_at)
    return if configuration_snapshot.present? && !replace

    snapshot = if flight_import && started_at.nil?
      { "unavailable_reason" => "The recording has no absolute timestamp." }
    else
      aircraft&.configuration_snapshot(at:) || {}
    end
    update!(configuration_snapshot: snapshot)
  end

  def height_m
    return nil unless min_altitude_m && max_altitude_m

    max_altitude_m - min_altitude_m
  end

  def video_ready?
    video.attached?
  end

  def video_processing?
    video_processing_status == "processing"
  end

  def video_failed?
    video_processing_status == "failed"
  end

  private

  def assign_code
    if code.present?
      if will_save_change_to_code? && (match = /\AFLT-(\d{4})-(\d+)\z/.match(code))
        IdentifierSequence.reserve_through!("flight_code/#{match[1]}", match[2])
      end
      return
    end
    return unless new_record?

    year = (started_at || Time.current).year
    next_sequence = IdentifierSequence.next_value!("flight_code/#{year}")
    self.code = format("FLT-%04d-%03d", year, next_sequence)
  end

  def video_upload_must_be_video
    return unless video_upload.attached?
    return if video_upload.blob.content_type&.start_with?("video/")
    return if VIDEO_UPLOAD_EXTENSIONS.include?(video_upload.blob.filename.extension_with_delimiter.downcase)

    errors.add(:video_upload, :invalid)
  end
end
