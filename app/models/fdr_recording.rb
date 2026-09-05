class FdrRecording < ApplicationRecord
  belongs_to :user

  validates :recorder_key, :boot_id, presence: true
end
