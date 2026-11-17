class Flight < ApplicationRecord
  STATUSES = %w[logged preparation live waiting_for_recording processing analysed review].freeze
  VIDEO_PROCESSING_STATUSES = %w[empty processing ready failed].freeze
  VIDEO_UPLOAD_EXTENSIONS = %w[.avi .m4v .mkv .mov .mp4 .webm].freeze
  LOCATION_SOURCES = %w[manual openstreetmap].freeze
  VISIBILITIES = %w[private team].freeze
  EFFECTIVE_VISIBILITIES = %w[private public shared].freeze
  # Where the flight is flown. The tunnel has no GPS, no exit and no landing.
  ENVIRONMENTS = %w[sky tunnel].freeze
  TUNNEL_GLIDE_RATIOS = (1.49..3.98)
  # Where tunnel flights are flown unless another place is entered.
  TUNNEL_LOCATION = "Inclined Slovenia"
  # Flying mass used to derive the lift a tunnel flight needs: pilot 75 kg, parachute 10 kg,
  # wing 13 kg, seat 3 kg (values given on 17 November 2026; clothing and helmet not counted).
  TUNNEL_FLYING_MASS_KG = 101
  # Projected wing area, from the 2.498 m CAD span and the sections of the wing model.
  WING_AREA_M2 = 1.31

  belongs_to :user
  belongs_to :pilot, class_name: "User", inverse_of: :piloted_flights
  belongs_to :flight_import, optional: true, inverse_of: :flights
  belongs_to :aircraft, optional: true
  belongs_to :fdr, class_name: "Assembly", optional: true

  # Preserve existing descriptions and compatibility with recording producers.
  alias_attribute :description, :name
  belongs_to :folder, class_name: "FlightFolder", optional: true, inverse_of: :flights
  has_many :imu_checks, dependent: :nullify
  has_many :track_points, dependent: :delete_all, inverse_of: :flight
  has_many :sensor_samples, dependent: :delete_all, inverse_of: :flight
  has_many :signal_sessions, dependent: :restrict_with_error
  has_many :operator_events, dependent: :delete_all
  has_many :flight_debriefs, dependent: :destroy
  has_many :comments, class_name: "FlightComment", dependent: :destroy, inverse_of: :flight
  has_many :tunnel_videos, dependent: :destroy
  attr_accessor :initial_comment, :initial_comment_images
  has_one_attached :video_upload
  has_one_attached :video

  before_validation :assign_code
  before_validation :assign_default_pilot, on: :create
  before_validation :assign_tunnel_location
  after_create :create_initial_comment
  validates :initial_comment, length: { maximum: FlightComment::MAX_LENGTH }, allow_blank: true
  validate :validate_initial_comment_images, if: :new_record?

  validates :code, presence: true
  validates :flown_on, presence: true, if: -> { logged? || validation_context == :logbook }
  validates :location, presence: true, if: -> { sky? && (logged? || validation_context == :logbook) }
  validates :environment, inclusion: { in: ENVIRONMENTS }
  validates :tunnel_glide_ratio, numericality: { greater_than_or_equal_to: TUNNEL_GLIDE_RATIOS.min, less_than_or_equal_to: TUNNEL_GLIDE_RATIOS.max }, allow_nil: true
  validate :fdr_must_be_recorder
  validate :pilot_must_be_available, if: -> { new_record? || will_save_change_to_pilot_id? }
  validate :log_time_must_be_valid
  validates :code, uniqueness: true
  validates :status, inclusion: { in: STATUSES }
  validates :visibility, inclusion: { in: VISIBILITIES }
  validates :video_processing_status, inclusion: { in: VIDEO_PROCESSING_STATUSES }
  validates :location_source, inclusion: { in: LOCATION_SOURCES }, allow_nil: true
  validates :video_exit_offset_seconds, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :video_duration_seconds, numericality: { greater_than: 0 }, allow_nil: true
  validate :video_upload_must_be_video
  attr_accessor :folder_assignment_user

  validate :folder_must_accept_contributor, if: -> { new_record? || will_save_change_to_folder_id? || will_save_change_to_user_id? }

  scope :recent, -> { order(started_at: :desc, created_at: :desc) }
  scope :visible_to, ->(user) {
    user ? where(user_id: user.id).or(where(folder_id: nil, visibility: "team")).or(where(folder_id: FlightFolder.visible_to(user).select(:id))) : none
  }
  scope :with_effective_visibility, ->(value) {
    value == "private" ? where(folder_id: nil, visibility: "private").or(where(folder_id: FlightFolder.where(visibility: "private").select(:id))) :
      value == "shared" ? where(folder_id: FlightFolder.where(visibility: %w[shared club]).select(:id)) :
      where(folder_id: nil, visibility: "team").or(where(folder_id: FlightFolder.where(visibility: "public").select(:id)))
  }

  ENVIRONMENTS.each do |value|
    define_method("#{value}?") { environment == value }
  end

  def environment_label
    environment.capitalize
  end

  # Angle of the tunnel airflow below the horizon, in degrees, for the set glide ratio.
  def tunnel_airflow_angle
    Math.atan(1 / tunnel_glide_ratio.to_f) * 180 / Math::PI if tunnel_glide_ratio
  end

  def owned_by?(user)
    user.present? && user_id == user.id
  end

  def visible_to?(user)
    user.present? && (owned_by?(user) || (folder ? folder.visible_to?(user) : visibility == "team"))
  end

  def effective_visibility
    folder&.visibility || (visibility == "team" ? "public" : "private")
  end

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
    aircraft&.display_name || "Not linked"
  end

  def display_pilot
    pilot.full_name || pilot.email_address
  end

  def logbook_view?
    logged? || preparation? || ((review? || processing?) && !flight_import_id && sample_count.zero? && sensor_sample_count.zero?)
  end

  def recording_enabled?
    fdr_id.present? || flight_import_id.present? || signal_sessions.exists? || imu_checks.exists?
  end

  # A date entered without a time keeps the time of the recording: saving another
  # field stores the date alone and must not move the flight to midnight.
  def time_from_recording?
    flown_on.present? && flown_at.nil? && started_at.present? && (started_at.to_date - flown_on).abs <= 1
  end

  def display_flown_on
    flown_on || display_started_at&.to_date
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

  def assign_tunnel_location
    return unless tunnel? && location.blank?

    self.location = TUNNEL_LOCATION
    self.location_source = "manual"
  end

  def assign_default_pilot
    self.pilot = user if pilot_id.nil?
  end

  def pilot_must_be_available
    return unless pilot
    return if new_record? && pilot_id == user_id
    return unless pilot.disabled?

    errors.add(:pilot, "must be an active user")
  end

  def create_initial_comment
    if @initial_comment_with_images
      @initial_comment_with_images.flight = self
      @initial_comment_with_images.save!
    elsif initial_comment.present?
      comments.create!(user:, body: initial_comment)
    end
  end

  def validate_initial_comment_images
    @initial_comment_with_images = nil
    return if Array(initial_comment_images).reject(&:blank?).empty?

    @initial_comment_with_images = FlightComment.new(flight: self, user:, body: initial_comment)
    @initial_comment_with_images.assign_images(uploads: initial_comment_images)
    unless @initial_comment_with_images.valid?
      errors.add(:initial_comment, @initial_comment_with_images.errors.full_messages.to_sentence)
    end
  end

  def fdr_must_be_recorder
    errors.add(:fdr, "must be an ExoFDR") if fdr_id.present? && !fdr&.controlled_fdr?
  end

  def log_time_must_be_valid
    errors.add(:flown_at, "is invalid") if flown_at_before_type_cast.present? && flown_at.nil?
  end

  def folder_must_accept_contributor
    return if folder_id.nil?

    errors.add(:folder, "must allow the person moving the flight to contribute") unless folder&.contributable_by?(folder_assignment_user || user)
  end

  def assign_code
    if code.present?
      if will_save_change_to_code? && (match = /\AFLT-(\d{4})-(\d+)\z/.match(code))
        IdentifierSequence.reserve_through!("flight_code/#{match[1]}", match[2])
      end
      return
    end
    return unless new_record?

    year = (flown_on || started_at || Time.current).year
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
