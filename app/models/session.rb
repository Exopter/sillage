class Session < ApplicationRecord
  belongs_to :user

  def otp_verified?
    otp_verified_at.present?
  end

  def verify_otp!
    update!(otp_verified_at: Time.current)
  end
end
