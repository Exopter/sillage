module Api
  module App
    module V1
      # Recorders owned by the account. Sillage does not record ownership of Lite
      # recorders yet (the claim flow comes with the Lite Bluetooth service), so the
      # list is empty and the app offers to link one.
      class RecordersController < BaseController
        def index
          render json: { recorders: [] }
        end
      end
    end
  end
end
