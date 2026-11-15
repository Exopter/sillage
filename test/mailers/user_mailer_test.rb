require "test_helper"

class UserMailerTest < ActionMailer::TestCase
  test "a member invitation is personal, dated and carries the rank card" do
    member = users(:invited_member)
    message = UserMailer.invitation(member)

    assert_equal [ member.email_address ], message.to
    assert_equal "Ada, your place in Flight Club is ready", message.subject
    html = message.html_part.body.decoded
    text = message.text_part.body.decoded
    [ html, text ].each do |body|
      assert_includes body, "as a Pioneer"
      assert_includes body, "FC 0007"
      assert_includes body, "valid until #{member.invitation_expires_at.strftime("%-d %B %Y")}"
      assert_match %r{http://www.example.com/invitations/\S+/edit}, body
    end
    assert_includes html, "ADA LINDQVIST"
    assert_match %r{src="http://www.example.com/assets/flight_club/card-pioneer-\w+\.jpg"}, html
    assert_match %r{src="http://www.example.com/assets/flight_club/wordmark-\w+\.png"}, html
    assert_not_includes html, "class="
  end

  test "the invitation link in the email opens the invitation" do
    member = users(:invited_member)
    token = UserMailer.invitation(member).text_part.body.decoded[%r{/invitations/(\S+)/edit}, 1]

    assert_equal member, User.find_by_token_for(:invitation, token)
  end

  test "accounts without a membership receive the standard invitation" do
    message = UserMailer.invitation(users(:invited))

    assert_equal "Your Sillage invitation", message.subject
    assert_includes message.html_part.body.decoded, "Accept invitation"
  end

  test "the confirmation welcomes the member with their rank and number" do
    member = users(:member)
    message = UserMailer.membership_confirmation(member)

    assert_equal "Welcome to Flight Club, Elias", message.subject
    assert_includes message.html_part.body.decoded, "an Explorer"
    assert_includes message.html_part.body.decoded, "FC 0008"
    assert_includes message.text_part.body.decoded, "http://www.example.com/profile#membership"
  end
end
