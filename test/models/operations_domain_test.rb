require "test_helper"

class OperationsDomainTest < ActiveSupport::TestCase
  test "an asset cannot have two active aircraft installations" do
    assembly = Assembly.create!(code: "FDR-INSTALL-001", name: "Installable FDR")
    first = Installation.create!(aircraft: aircraft(:pilatus), installable: assembly, installed_at: 1.hour.ago)
    duplicate = Installation.new(aircraft: aircraft(:exowing), installable: assembly, installed_at: Time.current)

    assert_not duplicate.valid?
    assert_includes duplicate.errors[:installable], "already has an active installation"

    first.remove!
    assert duplicate.save
  end

  test "a nested asset cannot also be installed directly on an aircraft" do
    function = Function.create!(code: "NAV-DIRECT", name: "Navigation direct")
    assembly = Assembly.create!(code: "FDR-NESTED-001", name: "Nested FDR")
    part = Part.create!(internal_number: "PART-991001", function:, model: "M9N", assembly:)

    installation = Installation.new(aircraft: aircraft(:pilatus), installable: part, installed_at: Time.current)

    assert_not installation.valid?
    assert_includes installation.errors[:installable], "must be removed from its assembly before direct installation"
  end

  test "a directly installed part cannot also be attached to an assembly" do
    function = Function.create!(code: "NAV-DIRECT-REVERSE", name: "Navigation direct reverse")
    assembly = Assembly.create!(code: "FDR-NESTED-REVERSE-001", name: "Nested FDR reverse")
    part = Part.create!(internal_number: "PART-991003", function:, model: "M9N")
    Installation.create!(aircraft: aircraft(:pilatus), installable: part, installed_at: Time.current)

    assert_not part.update(assembly:)
    assert_includes part.errors[:assembly], "cannot be set while the part is installed directly on an aircraft"
  end

  test "validated test runs are immutable" do
    function = Function.create!(code: "QUAL-IMMUTABLE", name: "Qualification")
    assembly = Assembly.create!(code: "FDR-QUAL-001", name: "Qualification assembly")
    Part.create!(internal_number: "PART-991002", function:, model: "Sensor", assembly:)
    build = Build.create!(code: "FDR-DEV-991", assembly:, created_by: users(:julien), arduino_core_version: "3.3")
    run = TestRun.create!(uuid: SecureRandom.uuid, build:, operator: users(:julien), recipe_id: "QUAL", recipe_version: "1", recipe_sha256: "a" * 64, ingestion_sha256: "b" * 64, outcome: "passed", ran_at: Time.current)
    run.validate_by!(users(:julien), note: "Reviewed")

    assert_not run.update(notes: "Changed later")
    assert_includes run.errors[:base], "Validated test runs are immutable"
    assert_not run.destroy
  end
end
