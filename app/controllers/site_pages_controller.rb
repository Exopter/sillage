# Public legal and support pages of exopter.com, linked from the App Store listing.
class SitePagesController < ApplicationController
  allow_unauthenticated_access
  layout "site"

  CONTACT_EMAIL = "support@exopter.com".freeze
  UPDATED_ON = Date.new(2026, 11, 27)

  before_action { @contact_email = CONTACT_EMAIL; @updated_on = UPDATED_ON }

  def privacy
  end

  def support
  end

  def legal
  end
end
