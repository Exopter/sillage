namespace :fdr do
  desc "Correct one legacy ECU identity after verifying its physical hardware MAC"
  task correct_identity: :environment do
    abort "Set RECORDER_ID, HARDWARE_MAC, OPERATOR_EMAIL, EVIDENCE and APPLY=true after physical verification." unless ENV["APPLY"] == "true"
    recorder = EmbeddedController.find(ENV.fetch("RECORDER_ID"))
    actor = User.find_by!(email_address: ENV.fetch("OPERATOR_EMAIL"))
    FdrIdentity::Reidentify.call(recorder:, hardware_mac: ENV.fetch("HARDWARE_MAC"), actor:, evidence: ENV.fetch("EVIDENCE"))
    puts "Recorder #{recorder.id}: #{recorder.device_id}. Existing keys and history retained; repeat calibration."
  end
end
