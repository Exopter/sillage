require "test_helper"
require "tempfile"
require "zip"

module FlySight
  class ImportServiceTest < ActiveSupport::TestCase
    UploadedFile = Struct.new(:path, :original_filename, :content_type, keyword_init: true) do
      def read(*args)
        file.read(*args)
      end

      def rewind
        file.rewind
      end

      private

      def file
        @file ||= File.open(path, "rb")
      end
    end

    setup do
      @user = users(:julien)
    end

    test "imports paired FlySight V2 files" do
      import = ImportService.create!([
        upload("flysight_v2/TRACK.CSV"),
        upload("flysight_v2/SENSOR.CSV")
      ], user: @user)

      assert_equal "pending", import.status
      assert import.source_files.attached?

      ImportService.new(import).call
      jump = import.jumps.first
      assert_equal "imported", import.status
      assert_equal @user, import.user
      assert_equal "fixture-device", import.device_id
      assert_equal 1, import.jumps.count
      assert_equal 8, jump.track_points.count
      assert_equal 8, jump.sensor_samples.count
      assert_equal 8, jump.sample_count
      assert jump.exit_at
      assert jump.opening_at
      assert jump.landing_at
    end

    test "imports a zipped FlySight V2 session folder" do
      archive = Tempfile.new([ "flysight", ".zip" ])
      archive.binmode

      Zip::File.open(archive.path, create: true) do |zip|
        zip.add("TEMP/0000/TRACK.CSV", file_fixture("flysight_v2/TRACK.CSV"))
        zip.add("TEMP/0000/SENSOR.CSV", file_fixture("flysight_v2/SENSOR.CSV"))
      end

      import = ImportService.create!([
        UploadedFile.new(path: archive.path, original_filename: "session.zip", content_type: "application/zip")
      ], user: @user)

      ImportService.new(import).call

      assert_equal "imported", import.status
      assert_equal 1, import.jumps.count
      assert_equal 8, import.jumps.first.sensor_samples.count
    ensure
      archive&.close!
    end

    test "imports a bulk FlySight ZIP with date and time folders" do
      archive = Tempfile.new([ "flysight-bulk", ".zip" ])
      archive.binmode

      Zip::File.open(archive.path, create: true) do |zip|
        %w[07-33-43 08-50-55].each do |session_folder|
          zip.add("26-07-08/#{session_folder}/TRACK.CSV", file_fixture("flysight_v2/TRACK.CSV"))
          zip.add("26-07-08/#{session_folder}/SENSOR.CSV", file_fixture("flysight_v2/SENSOR.CSV"))
          zip.get_output_stream("26-07-08/#{session_folder}/RAW.UBX") { |stream| stream.write("raw ubx payload") }
        end
      end

      import = ImportService.create!([
        UploadedFile.new(path: archive.path, original_filename: "bulk.zip", content_type: "application/zip")
      ], user: @user)

      ImportService.new(import).call

      assert_equal "imported", import.status
      assert_equal 2, import.jumps.count
      assert_equal 2, import.details.fetch("sessions_count")
      assert_equal [ 8, 8 ], import.jumps.order(:id).map { |jump| jump.track_points.count }
    ensure
      archive&.close!
    end

    test "rejects FlySight V2 track without matching sensor file" do
      import = ImportService.create!([ upload("flysight_v2/TRACK.CSV") ], user: @user)

      assert_raises(FlySight::Error) do
        ImportService.new(import).call
      end

      assert_equal "failed", import.reload.status
    end

    private

    def upload(fixture_path)
      file = file_fixture(fixture_path)
      UploadedFile.new(path: file.to_s, original_filename: file.basename.to_s, content_type: "text/csv")
    end
  end
end
