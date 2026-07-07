require "test_helper"

class FlySightImportJobTest < ActiveJob::TestCase
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

  test "processes the attached FlySight import" do
    flight_import = FlySight::ImportService.create!(
      [
        upload("flysight_v2/TRACK.CSV"),
        upload("flysight_v2/SENSOR.CSV")
      ],
      user: users(:julien)
    )

    FlySightImportJob.perform_now(flight_import)

    assert_equal "imported", flight_import.reload.status
    assert_equal 1, flight_import.jumps.count
  end

  private

  def upload(fixture_path)
    file = file_fixture(fixture_path)
    UploadedFile.new(path: file.to_s, original_filename: file.basename.to_s, content_type: "text/csv")
  end
end
