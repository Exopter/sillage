namespace :flights do
  desc "Refresh derived analysis for one flight without modifying raw telemetry"
  task :refresh_analysis, [ :id ] => :environment do |_task, args|
    abort "Usage: bin/rails 'flights:refresh_analysis[FLIGHT_ID]'" unless args[:id].to_s.match?(/\A[0-9]+\z/)

    flight = Flights::RefreshAnalysis.call(Flight.find(args[:id]))
    puts "Refreshed derived analysis for #{flight.code}; raw telemetry and source files are unchanged."
  end
end
