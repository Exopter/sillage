module Pagination
  extend ActiveSupport::Concern

  private

  def paginate(scope, per_page: 30)
    @page = [ params[:page].to_i, 1 ].max
    records = scope.order(id: :desc).offset((@page - 1) * per_page).limit(per_page + 1).to_a
    @next_page = @page + 1 if records.size > per_page
    records.first(per_page)
  end
end
