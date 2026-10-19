class FlightCommentsController < ApplicationController
  before_action :set_flight
  before_action :set_owned_comment, only: [ :edit, :update, :destroy ]
  before_action :disable_caching

  def index
    render_comments
  end

  def create
    @new_comment = @flight.comments.build(comment_params.merge(user: Current.user))
    if @new_comment.save
      redirect_to flight_comments_path(@flight, result: "created"), status: :see_other
    else
      render_comments(status: :unprocessable_entity)
    end
  end

  def edit
    @editing_comment = @comment
    render_comments
  end

  def update
    if @comment.update(comment_params)
      redirect_to flight_comments_path(@flight, result: "updated"), status: :see_other
    else
      @editing_comment = @comment
      render_comments(status: :unprocessable_entity)
    end
  end

  def destroy
    @comment.destroy!
    redirect_to flight_comments_path(@flight, result: "deleted"), status: :see_other
  end

  private

  def disable_caching
    response.headers["Cache-Control"] = "no-store"
  end

  def set_flight
    @flight = Flight.visible_to(Current.user).find(params[:flight_id])
  end

  def set_owned_comment
    @comment = @flight.comments.where(user: Current.user).find(params[:id])
  end

  def comment_params
    params.require(:flight_comment).permit(:body)
  end

  def render_comments(status: :ok)
    render partial: "flight_comments/comments", locals: {
      flight: @flight, new_comment: @new_comment, editing_comment: @editing_comment,
      message: { "created" => "Comment posted.", "updated" => "Comment updated.", "deleted" => "Comment deleted." }[params[:result]]
    }, status:
  end
end
