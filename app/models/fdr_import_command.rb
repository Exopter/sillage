class FdrImportCommand < ApplicationRecord
  ACTIONS = { "priority" => 1, "skip" => 2, "restore" => 3, "pause" => 4, "resume" => 5, "catalog" => 7 }.freeze
  SIGNATURE_DOMAIN = "exopter/fdr/sillage-command/v1\0".b

  belongs_to :embedded_controller
  belongs_to :requested_by, class_name: "User"
  validates :action, inclusion: { in: ACTIONS.values }
  validates :status, inclusion: { in: %w[pending acknowledged failed expired] }
  validates :recorder_boot_id, :file_boot_id, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 0xffff_ffff }
  validates :file_index, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 999_999 }
  validates :expires_at, presence: true
  scope :pending, -> { where(status: "pending") }

  def wire_payload
    "IMPORT1\0".b + [ id, recorder_boot_id, expires_at.to_i, action, file_index, file_boot_id ].pack("Q<L<L<CL<L<")
  end

  def signature
    OpenSSL::HMAC.hexdigest("SHA256", embedded_controller.fdr_auth_key, SIGNATURE_DOMAIN + wire_payload)
  end
end
