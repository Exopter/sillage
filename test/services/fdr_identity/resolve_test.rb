require "test_helper"

module FdrIdentity
  class ResolveTest < ActiveSupport::TestCase
    test "resolves the aircraft that carried the controller at recording time" do
      first_assembly = Assembly.create!(name: "First FDR")
      second_assembly = Assembly.create!(name: "Second FDR")
      function = Function.find_or_create_by!(code: "CONTROLLER") { |record| record.name = "Controller" }
      part = Part.create!(function:, manufacturer: "Seeed Studio", model: "XIAO ESP32S3")
      controller = create_embedded_controller(part:, device_id: "ECU-A172E0")

      controller.part.install_in!(first_assembly, at: 5.hours.ago)
      first_aircraft_installation = Installation.create!(
        aircraft: aircraft(:pilatus),
        installable: first_assembly,
        installed_at: 5.hours.ago
      )
      first_aircraft_installation.remove!(at: 3.hours.ago)
      controller.part.remove_from_assembly!(at: 3.hours.ago)

      controller.part.install_in!(second_assembly, at: 2.hours.ago)
      Installation.create!(aircraft: aircraft(:exowing), installable: second_assembly, installed_at: 2.hours.ago)

      historical = Resolve.new(controller.device_id, at: 4.hours.ago).call
      current = Resolve.new(controller.device_id).call

      assert_equal first_assembly, historical.installation.installable
      assert_equal aircraft(:pilatus), historical.aircraft
      assert_equal second_assembly, current.installation.installable
      assert_equal aircraft(:exowing), current.aircraft
    end
  end
end
