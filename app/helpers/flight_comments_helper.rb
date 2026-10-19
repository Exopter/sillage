module FlightCommentsHelper
  def comment_author_name(user)
    user.email_address.split("@").first.split(/[._-]/).map(&:capitalize).join(" ")
  end
end
