namespace :authentication do
  desc "Create or refresh the default admin invitation"
  task bootstrap_default_admin: :environment do
    user = User.default_admin
    user.send_invitation!
    puts "Invitation prepared for #{user.email_address}"
  end
end
