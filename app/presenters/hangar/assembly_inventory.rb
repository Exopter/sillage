module Hangar
  class AssemblyInventory
    Node = Data.define(:key, :asset, :parent_key, :kind, :label, :subtitle, :search, :children) do
      def assembly?
        asset.is_a?(Assembly)
      end
    end

    attr_reader :nodes, :roots, :assemblies

    def initialize(state: nil)
      all = Assembly.includes(:fdr_functional_configuration, parts: :function).ordered.to_a
      by_id = all.index_by(&:id)
      included = all.select { |assembly| state == "all" || (state ? assembly.serviceability_state == state : assembly.serviceability_state != "retired") }.to_set
      included.to_a.each do |assembly|
        while (assembly = by_id[assembly.parent_id])
          included.add(assembly)
        end
      end
      @assemblies = all.select { |assembly| included.include?(assembly) }
      @nodes = {}
      @assemblies.each { |assembly| add_assembly(assembly) }
      @nodes.values.each { |node| @nodes[node.parent_key]&.children&.push(node) }
      @roots = @nodes.values.select { |node| node.parent_key.nil? }
      @nodes.each_value do |node|
        node.children.sort_by! { |child| [ child.assembly? ? 0 : 1, Assembly::FDR_MODULE_TYPES.index(child.asset.try(:fdr_component_type)) || 9, child.asset.internal_number.to_s ] }
      end
      @aircraft = Installation.active.where(installable_type: "Assembly", installable_id: @assemblies.map(&:id))
        .includes(:aircraft).to_h { |installation| [ "assembly-#{installation.installable_id}", installation.aircraft ] }
      @part_counts = {}
    end

    def find(key)
      nodes[key]
    end

    def ancestors(node)
      result = []
      while (node = nodes[node.parent_key])
        result.unshift(node)
      end
      result
    end

    def aircraft(node)
      @aircraft[node.key] || ancestors(node).reverse.filter_map { |parent| @aircraft[parent.key] }.first
    end

    def part_count(node)
      @part_counts[node.key] ||= node.assembly? ? node.children.sum { |child| part_count(child) } : 1
    end

    def direct_parts(node)
      node.children.reject(&:assembly?)
    end

    def child_assemblies(node)
      node.children.select(&:assembly?)
    end

    def groups
      [ [ "SYSTEMS", "Grouped modules", roots.select { |node| node.kind == "system" }, "systems" ],
        [ "Standalone", "Not assigned to a system", roots.reject { |node| node.kind == "system" }, "standalone" ] ]
    end

    private

    def add_assembly(assembly)
      key = "assembly-#{assembly.id}"
      role = assembly.fdr_component_label || assembly.assembly_type || "Assembly"
      nodes[key] = Node.new(key:, asset: assembly, parent_key: ("assembly-#{assembly.parent_id}" if assembly.parent_id),
        kind: assembly.fdr_system? ? "system" : "assembly", label: assembly.display_name, subtitle: role,
        search: [ assembly.display_name, assembly.internal_number, role ].join(" ").downcase, children: [])
      assembly.parts.each do |part|
        next if assembly.controlled_fdr? && part.function.code == "CONTROLLER"

        part_key = "part-#{part.id}"
        nodes[part_key] = Node.new(key: part_key, asset: part, parent_key: key, kind: "part", label: part.display_name,
          subtitle: part.serial_number.presence || part.internal_number,
          search: [ part.display_name, part.serial_number, part.internal_number, part.function.name, part.function.code ].join(" ").downcase, children: [])
      end
    end
  end
end
