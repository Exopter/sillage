module FdrIdentity
  module Presentation
    def self.label(identity)
      return "Historical FDR identity unavailable" unless identity&.key?("assembly")

      assembly = identity["assembly"]
      assembly ? "#{assembly.fetch('name')} · #{assembly.fetch('identity_label')}" : "Unassigned ECU"
    end
  end
end
