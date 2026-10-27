module FdrAssemblyHierarchy
  extend ActiveSupport::Concern

  included do
    has_many :system_memberships, class_name: "FdrSystemMembership", foreign_key: :system_assembly_id, dependent: :restrict_with_error
    has_many :module_memberships, class_name: "FdrSystemMembership", foreign_key: :module_assembly_id, dependent: :restrict_with_error

    before_validation :default_fdr_assembly_method, on: :create
    validate :validate_fdr_component_type
    validate :validate_fdr_parent
    before_save :lock_fdr_parent_change
    after_save :record_fdr_parent_change

    scope :connectable_fdrs, -> { where(assembly_type: "ExoFDR", fdr_component_type: [ nil, *Assembly::FDR_MODULE_TYPES, "LITE" ]) }
  end

  def fdr_system?
    controlled_fdr? && fdr_component_type == "SYSTEMS"
  end

  def fdr_module?
    controlled_fdr? && Assembly::FDR_MODULE_TYPES.include?(fdr_component_type)
  end

  def fdr_component_label
    Assembly::FDR_COMPONENT_TYPES[fdr_component_type]
  end

  def fdr_system_at(time = nil)
    return unless fdr_module?
    return parent if time.nil? && parent&.fdr_system?
    module_memberships.covering(time).includes(:system_assembly).recent.first&.system_assembly if time
  end

  def fdr_modules_at(time = nil)
    return [] unless fdr_system?
    return children.order(:fdr_component_type).to_a unless time
    system_memberships.covering(time).includes(:module_assembly).order(:component_type).map(&:module_assembly)
  end

  def fdr_identity_context
    { name: display_name, identity_label:, serial_number: }
  end

  private

  def default_fdr_assembly_method
    return unless controlled_fdr? && fdr_component_type.present?
    self.assembly_method = "PCB" if !fdr_system? && assembly_method.blank?
  end

  def validate_fdr_component_type
    if fdr_component_type.present?
      unless controlled_fdr? && fdr_functional_configuration&.version.to_i >= 2 && Assembly::FDR_COMPONENT_TYPES.key?(fdr_component_type)
        errors.add(:fdr_component_type, "requires an ExoFDR V2 or later configuration and a supported type")
      end
      if fdr_system? ? assembly_method.present? : assembly_method != "PCB"
        errors.add(:assembly_method, fdr_system? ? "does not apply to a logical system" : "must be PCB from V2 onward")
      end
    elsif new_record? && controlled_fdr? && fdr_functional_configuration&.version.to_i >= 2
      errors.add(:fdr_component_type, "must be selected from V2 onward")
    end
    if fdr_system? && serviceability_state == "retired" && children.exists?
      errors.add(:serviceability_state, "requires detaching every module before retirement")
    end
  end

  def validate_fdr_parent
    return unless parent
    if parent.fdr_system?
      errors.add(:parent, "only accepts Main, Central, AirSpeed and Display modules") unless fdr_module?
      if fdr_module? && parent.children.where(fdr_component_type:).where.not(id: id).exists?
        errors.add(:parent, "already contains this module type")
      end
    elsif fdr_module?
      errors.add(:parent, "must be an ExoFDR SYSTEMS assembly")
    end
    if parent.fdr_component_type.present? && !parent.fdr_system?
      errors.add(:parent, "is a device and cannot contain subassemblies")
    end
  end

  def lock_fdr_parent_change
    return unless fdr_module? && will_save_change_to_parent_id?
    if persisted? && self.class.where(id: id).lock.pick(:parent_id) != parent_id_in_database
      errors.add(:parent, "changed concurrently; reload this module")
      throw(:abort)
    end
    self.class.where(id: [ parent_id, parent_id_in_database ].compact).order(:id).lock.load
    if parent && (parent.reload.serviceability_state == "retired" || parent.children.where(fdr_component_type:).where.not(id: id).exists?)
      errors.add(:parent, "is retired or already contains this module type")
      throw(:abort)
    end
  end

  def record_fdr_parent_change
    return unless fdr_module? && saved_change_to_parent_id?
    time = Time.current
    module_memberships.active.each { |membership| membership.update!(removed_at: time) }
    if parent_id
      module_memberships.create!(system_assembly: parent, component_type: fdr_component_type, installed_at: time)
    end
  end
end
