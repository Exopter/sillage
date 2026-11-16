require "test_helper"
require Rails.root.join("db/migrate/20261111180000_rename_fdr_main_to_seat")
require Rails.root.join("db/migrate/20261116120000_restore_fdr_seat_identities")

class FdrSeatMigrationTest < ActiveSupport::TestCase
  test "renaming preserves board bindings and membership while advancing the Seat sequence" do
    configuration = create_fdr_functional_configuration(version: 765432)
    system = Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration: configuration, fdr_component_type: "SYSTEMS")
    seat = Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration: configuration, fdr_component_type: "SEAT", parent: system)
    board = EmbeddedController.create!(device_id: "ECU-441BF685BEC8")
    FdrIdentity::BindBoard.new(assembly: seat, controller: board).call
    membership = seat.module_memberships.sole
    connection = ActiveRecord::Base.connection
    assembly_constraint = connection.check_constraints(:assemblies).find { |constraint| constraint.name == "assemblies_exofdr_identity" }.expression
    membership_constraint = connection.check_constraints(:fdr_system_memberships).find { |constraint| constraint.name == "fdr_membership_module_type" }.expression
    connection.remove_check_constraint :assemblies, name: "assemblies_exofdr_identity"
    connection.remove_check_constraint :fdr_system_memberships, name: "fdr_membership_module_type"
    seat.update_columns(name: "EXOFDR-V765432-MAIN-01", serial_number: "EXOFDR-V765432-MAIN-01", fdr_component_type: "MAIN")
    FdrSystemMembership.where(id: membership.id).update_all(component_type: "MAIN")
    connection.add_check_constraint :assemblies, assembly_constraint.gsub("SEAT", "MAIN"), name: "assemblies_exofdr_identity"
    connection.add_check_constraint :fdr_system_memberships, membership_constraint.gsub("SEAT", "MAIN"), name: "fdr_membership_module_type"
    IdentifierSequence.reserve_through!("EXOFDR-V765432-MAIN", 11)
    ActiveRecord::Migration.suppress_messages { RenameFdrMainToSeat.new.up }

    assert_equal "EXOFDR-V765432-SEAT-01", seat.reload.serial_number
    assert_equal "EXOFDR-V765432-MAIN-01", seat.legacy_identity["previous_serial_number"]
    assert_equal board, seat.embedded_controller
    assert_equal system, seat.parent
    assert_equal "SEAT", membership.reload.component_type
    assert_equal 12, IdentifierSequence.next_value!("EXOFDR-V765432-SEAT")
    assert_not Assembly::FDR_COMPONENT_TYPES.key?("MAIN")
  end

  test "settling on Seat converts identities put back to Main and restores the strict constraints" do
    configuration = create_fdr_functional_configuration(version: 765433)
    system = Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration: configuration, fdr_component_type: "SYSTEMS")
    seat = Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration: configuration, fdr_component_type: "SEAT", parent: system)
    closed = seat.module_memberships.sole
    connection = ActiveRecord::Base.connection
    both = "'MAIN', 'SEAT', 'CENTRAL', 'AIRSPEED', 'DISPLAY'"
    # Production on 16 November: constraints widened to both names, the module back on its Main identity.
    connection.remove_check_constraint :assemblies, name: "assemblies_exofdr_identity"
    connection.remove_check_constraint :fdr_system_memberships, name: "fdr_membership_module_type"
    connection.add_check_constraint :fdr_system_memberships, "component_type IN (#{both})", name: "fdr_membership_module_type"
    seat.update_columns(name: "EXOFDR-V765433-MAIN-01", serial_number: "EXOFDR-V765433-MAIN-01", fdr_component_type: "MAIN",
      legacy_identity: { "previous_serial_number" => "EXOFDR-V1-PCB-03" })
    closed.update_columns(removed_at: Time.current)
    FdrSystemMembership.insert_all!([ { system_assembly_id: system.id, module_assembly_id: seat.id, component_type: "MAIN", installed_at: Time.current, created_at: Time.current, updated_at: Time.current } ])

    2.times { ActiveRecord::Migration.suppress_messages { RestoreFdrSeatIdentities.new.up } }

    seat.reload
    assert_equal "EXOFDR-V765433-SEAT-01", seat.serial_number
    assert_equal seat.serial_number, seat.name
    assert_equal "SEAT", seat.fdr_component_type
    assert_equal "EXOFDR-V1-PCB-03", seat.legacy_identity["previous_serial_number"]
    assert_equal [ "EXOFDR-V765433-MAIN-01" ], seat.legacy_identity["former_serial_numbers"]
    assert_equal %w[SEAT SEAT], seat.module_memberships.order(:id).pluck(:component_type)
    assert_raises(ActiveRecord::StatementInvalid) do
      ActiveRecord::Base.transaction(requires_new: true) { FdrSystemMembership.where(module_assembly_id: seat.id).update_all(component_type: "MAIN") }
    end
  end
end
