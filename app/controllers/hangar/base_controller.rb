module Hangar
  class BaseController < ApplicationController
    private

    # Actions started from a list return to that list instead of the record page.
    def hangar_return_path(default)
      target = params[:return_to].to_s
      target.match?(%r{\A/hangar(?:[/?]|\z)}) ? target : default
    end
  end
end
