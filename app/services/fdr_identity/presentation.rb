module FdrIdentity
  module Presentation
    def self.label(identity)
      return "Historical FDR identity unavailable" unless identity&.key?("assembly")

      assembly = identity["assembly"]
      return "Unassigned ECU" unless assembly

      # Captured historical serials must never be inferred from the current ECU assignment.
      assembly["serial_number"].presence || [ assembly.fetch("name"), assembly.fetch("identity_label") ].uniq.join(" · ")
    end
  end
end
