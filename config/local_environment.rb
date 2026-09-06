# frozen_string_literal: true

require_relative "environment_file"

module Sillage
  module LocalEnvironment
    DEPLOY_FALLBACK_KEYS = %w[CESIUM_ION_TOKEN].freeze

    def self.load(root: File.expand_path("..", __dir__))
      EnvironmentFile.load(File.join(root, ".env.local"))
      EnvironmentFile.load(File.join(root, ".env.deploy.local"), only: DEPLOY_FALLBACK_KEYS)
    end
  end
end
