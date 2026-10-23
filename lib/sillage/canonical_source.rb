module Sillage
  module CanonicalSource
    TEXT_EXTENSIONS = %w[.css .js .jsx .json .svg].freeze

    def self.read(path)
      content = File.binread(path)
      TEXT_EXTENSIONS.include?(File.extname(path)) ? content.gsub("\r\n", "\n") : content
    end
  end
end
