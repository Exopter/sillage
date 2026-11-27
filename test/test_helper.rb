ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module AuthenticationTestHelper
  def sign_in_as_admin(user, **options)
    user.update!(role: "admin") unless user.admin?
    sign_in_as(user, **options)
  end

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

  def signal_recorder
    @signal_recorder ||= create_embedded_controller(assembly: create_exofdr_assembly, device_id: "ECU-112233445566")
  end

  def create_signal_session(user: users(:julien), recorder: signal_recorder, **attributes)
    metadata = attributes.delete(:station_metadata) || {}
    user.signal_sessions.create!(**attributes, station_metadata: metadata.merge(
      "recorder_device_id" => recorder.device_id, "recorder_assembly_id" => recorder.assembly.id))
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

# The user role sees another pilot's flight only once it is shared with it through a folder.
module FlightSharingTestHelper
  def share_flight(flight, with:)
    folder = FlightFolder.create!(user: flight.user, name: "Shared #{flight.id}-#{Array(with).map(&:id).join("-")}", visibility: "shared")
    Array(with).each { |user| FlightFolderMembership.create!(flight_folder: folder, user:) }
    flight.update!(folder:)
  end

  def unshare_flight(flight)
    flight.update!(folder: nil, visibility: "private")
  end
end

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    include EmbeddedControllerTestHelper
    include FlightSharingTestHelper

    # Add more helper methods to be used by all tests here...
    teardown { Current.reset }
  end
end

class ActionDispatch::IntegrationTest
  include AuthenticationTestHelper
end
