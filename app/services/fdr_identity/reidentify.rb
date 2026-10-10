module FdrIdentity
  # Explicit maintenance only, after checking the physical board's complete MAC.
  # Never resolve a new controller by the colliding legacy manufacturer prefix.
  class Reidentify
    def self.call(recorder:, hardware_mac:, actor:, evidence:)
      raise ArgumentError, "Physical identity evidence is required." if evidence.to_s.strip.blank?
      raise ArgumentError, "Expected a complete colon-separated hardware MAC." unless hardware_mac.to_s.match?(/\A(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\z/i)

      bytes = hardware_mac.upcase.split(":")
      legacy_id = "ECU-#{bytes.first(3).reverse.join}"
      device_id = "ECU-#{bytes.join}"
      recorder.with_lock do
        return recorder if recorder.device_id == device_id
        raise ArgumentError, "The legacy identity does not match the verified hardware MAC." unless recorder.device_id == legacy_id
        raise ArgumentError, "The complete identity is already registered; reconcile the records explicitly." if EmbeddedController.where(device_id:).exists?

        recorder.update!(device_id:)
        # Keep keys, inventory relationships and original recordings on this row.
        recorder.imu_checks.find_each do |check|
          check.update!(evidence: check.evidence.reverse_merge("device_id" => legacy_id),
            invalidated_at: check.invalidated_at || Time.current,
            invalidation_reason: check.invalidation_reason || "Controller identity corrected. Run a new calibration reference.")
        end
        recorder.record_activity!("identity_corrected", source: "maintenance", actor:,
          details: { previous_device_id: legacy_id, device_id:, hardware_mac: hardware_mac.downcase, evidence: })
      end
      recorder
    end
  end
end
