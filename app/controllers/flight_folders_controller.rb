class FlightFoldersController < ApplicationController
  before_action :set_folder, only: %i[edit update update_color destroy]
  before_action :disable_caching
  before_action :load_member_options, only: %i[new create edit update member_search]

  def member_search
    query = params[:q].to_s.strip.downcase.first(100)
    return render json: { members: [], has_more: false } if query.length < 2

    matches = @member_options
      .where("LOWER(email_address) LIKE ?", "%#{User.sanitize_sql_like(query)}%")
      .where.not(id: Array(params[:exclude_ids]).first(1000))
      .limit(9).pluck(:id, :email_address)
    render json: { members: matches.first(8).map { |id, email| { id: id, email: email } }, has_more: matches.length > 8 }
  end

  def index
    redirect_to flights_path
  end

  def new
    @folder = Current.user.flight_folders.new
    render partial: "sharing" if turbo_frame_request?
  end

  def create
    @folder = Current.user.flight_folders.new(folder_params)
    if @folder.save
      redirect_to flights_path(folder: @folder.id), notice: "Folder created."
    else
      render :new, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotUnique
    duplicate_name(:new)
  end

  def edit
    render partial: "sharing" if turbo_frame_request?
  end

  def update
    if @folder.update(folder_params)
      redirect_to flights_path(folder: @folder.id), notice: "Folder updated."
    else
      render :edit, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotUnique
    duplicate_name(:edit)
  end

  def destroy
    @folder.destroy!
    redirect_to flights_path, status: :see_other, notice: "Folder deleted. Its flights are now unfiled and use their individual visibility."
  end

  def update_color
    if @folder.update(params.require(:flight_folder).permit(:color))
      render json: { color: @folder.color }
    else
      render json: { errors: @folder.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def set_folder
    @folder = Current.user.flight_folders.find(params[:id])
  end

  def folder_params
    attributes = params.require(:flight_folder).permit(:name, :visibility, :color, member_ids: [])
    if attributes.key?(:member_ids)
      ids = attributes[:member_ids].reject(&:blank?).map(&:to_s).uniq
      allowed = @member_options.where(id: ids).pluck(:id).map(&:to_s)
      raise ActiveRecord::RecordNotFound unless ids.sort == allowed.sort
      attributes[:member_ids] = ids
    end
    attributes
  end

  def load_member_options
    @member_options = User.active.where.not(id: Current.user.id).where.not(invitation_accepted_at: nil).order(:email_address)
  end

  def duplicate_name(view)
    @folder.errors.add(:name, :taken)
    render view, status: :unprocessable_entity
  end

  def disable_caching
    no_store
  end
end
