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

module EmbeddedControllerTestHelper
  def create_fdr_functional_configuration(version: 0, **attributes)
    FdrFunctionalConfiguration.find_or_create_by!(version:) do |configuration|
      configuration.assign_attributes(planned_capabilities: "ECU, IMU, airspeed, GNSS and microSD; no radio.", **attributes)
    end
  end

  def create_exofdr_assembly(**attributes)
    Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration: create_fdr_functional_configuration,
      assembly_method: "PERF", **attributes)
  end

  def create_installed_part(assembly:, **attributes)
    Part.create!(**attributes).tap { |part| part.install_in!(assembly) }
  end

  def create_embedded_controller(assembly: nil, part: nil, **attributes)
    if part.nil? && assembly
      part = assembly.controller_part
      unless part
        function = Function.find_or_create_by!(code: "CONTROLLER") do |record|
          record.name = "Controller"
          record.description = "FDR processing and coordination"
        end
        part = create_installed_part(
          assembly:,
          function:,
          manufacturer: "Seeed Studio",
          model: "XIAO ESP32S3"
        )
      end
    end

    EmbeddedController.create!(part:, **attributes)
  end
end

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    include EmbeddedControllerTestHelper

    # Add more helper methods to be used by all tests here...
    teardown { Current.reset }
  end
end

class ActionDispatch::IntegrationTest
  include AuthenticationTestHelper
end
