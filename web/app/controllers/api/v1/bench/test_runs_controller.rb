require "digest"
require "time"

module Api
  module V1
    module Bench
      class TestRunsController < BaseController
        MAX_UPLOAD_BYTES = 10.megabytes

        def create
          validate_upload_sizes!
          result = parsed_result
          fingerprint = Digest::SHA256.hexdigest(JSON.generate(canonicalize(result)))
          existing = TestRun.find_by(uuid: result.fetch("uuid"))
          return render_existing(existing, fingerprint) if existing

          attributes = test_run_attributes(result)
          capture_build_configuration!(attributes.fetch(:build), result.fetch("build_configuration"))
          test_run = TestRun.new(attributes.merge(
            operator: current_bench_user,
            ingestion_sha256: fingerprint
          ))
          test_run.artifacts.attach(Array(params[:files])) if params[:files].present?
          test_run.save!

          render json: response_payload(test_run), status: :created
        rescue KeyError, JSON::ParserError, ArgumentError => error
          render json: { error: error.message }, status: :bad_request
        rescue ActiveRecord::RecordNotFound => error
          render json: { error: error.message }, status: :not_found
        rescue ActiveRecord::RecordInvalid => error
          render json: { error: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
        end

        private

        def parsed_result
          value = params[:result]
          return JSON.parse(value) if value.is_a?(String)
          return value.to_unsafe_h if value.respond_to?(:to_unsafe_h)

          request.request_parameters.deep_stringify_keys
        end

        def canonicalize(value)
          case value
          when Hash
            value.keys.sort.to_h { |key| [ key, canonicalize(value.fetch(key)) ] }
          when Array
            value.map { |item| canonicalize(item) }
          else
            value
          end
        end

        def test_run_attributes(result)
          build = Build.find_by!(code: result.fetch("build_code"))
          part_number = result["part_internal_number"].presence
          recipe = result.fetch("recipe")
          {
            uuid: result.fetch("uuid"),
            build: build,
            part: part_number ? Part.find_by!(internal_number: part_number) : nil,
            recipe_id: recipe.fetch("id"),
            recipe_version: recipe.fetch("version").to_s,
            recipe_sha256: recipe.fetch("sha256"),
            outcome: result.fetch("outcome"),
            measurements: result.fetch("measurements", {}),
            artifact_manifest: result.fetch("artifacts", []),
            ran_at: Time.iso8601(result.fetch("ran_at")),
            notes: result["notes"]
          }
        end

        def capture_build_configuration!(build, configuration)
          configuration = configuration.to_h.deep_stringify_keys
          values = {
            source_revision: configuration.fetch("source_revision"),
            source_dirty: ActiveModel::Type::Boolean.new.cast(configuration.fetch("source_dirty")),
            source_diff_sha256: configuration["source_diff_sha256"],
            arduino_core_version: configuration.fetch("arduino_core_version").to_s,
            firmware_sha256: configuration["firmware_sha256"]
          }
          assert_configuration_matches!(build, values) if build.locked?
          return if build.locked?

          values[:source_diff] = uploaded_source_diff(values[:source_diff_sha256]) if values[:source_dirty]
          build.update!(values)
        end

        def assert_configuration_matches!(build, values)
          mismatches = values.filter_map do |attribute, value|
            attribute.to_s if build.public_send(attribute).to_s != value.to_s
          end
          return if mismatches.empty?

          raise ArgumentError,
            "Evidence does not match frozen build fields: #{mismatches.join(', ')}. Clone as next build."
        end

        def uploaded_source_diff(expected_sha256)
          upload = Array(params[:files]).find { |file| file.original_filename == "source.diff" }
          return unless upload

          contents = upload.read
          upload.rewind
          actual_sha256 = Digest::SHA256.hexdigest(contents)
          raise ArgumentError, "Uploaded source.diff does not match its SHA-256." if actual_sha256 != expected_sha256

          contents.force_encoding(Encoding::UTF_8).scrub
        end

        def validate_upload_sizes!
          oversized = Array(params[:files]).find { |file| file.size > MAX_UPLOAD_BYTES }
          return unless oversized

          raise ArgumentError, "#{oversized.original_filename} exceeds the 10 MB v1 upload limit."
        end

        def render_existing(existing, fingerprint)
          if existing.ingestion_sha256 == fingerprint
            render json: response_payload(existing), status: :ok
          else
            render json: { error: "This execution UUID was already used with different content." }, status: :conflict
          end
        end

        def response_payload(test_run)
          {
            uuid: test_run.uuid,
            build_code: test_run.build.code,
            outcome: test_run.outcome,
            test_run_url: forge_test_run_path(test_run)
          }
        end
      end
    end
  end
end
