ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module AuthenticationTestHelper
  def sign_in_as(user, otp_verified: true)
    post session_path, params: {
      email_address: user.email_address,
      password: "password123456"
    }

    session_record = user.sessions.order(created_at: :desc).first
    session_record&.update!(otp_verified_at: Time.current) if otp_verified
    Current.session = session_record
    session_record
  end
end

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
    teardown { Current.reset }
  end
end

class ActionDispatch::IntegrationTest
  include AuthenticationTestHelper
end
