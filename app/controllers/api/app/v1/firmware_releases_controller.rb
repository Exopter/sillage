module Api
  module App
    module V1
      # No signed Lite release is published yet: the running version is reported as the latest.
      class FirmwareReleasesController < BaseController
        def latest
          head :no_content
        end
      end
    end
  end
end
