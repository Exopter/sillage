require "tempfile"

module ExoFdr
  # A sparse bitmap of uint32 sequence numbers with a single cached page. Normal
  # sequential logs touch one page per 32,768 records; replay cannot grow a Ruby Set.
  class SequenceSet
    PAGE_BYTES = 4_096

    def initialize
      @file = Tempfile.new("fdr-sequences", binmode: true)
    end

    def add?(sequence)
      raise Error, "Invalid FDR sequence." unless sequence.between?(0, 0xffffffff)

      byte = sequence / 8
      page = byte / PAGE_BYTES
      if page != @page
        if @dirty
          @file.seek(@page * PAGE_BYTES)
          @file.write(@data)
        end
        @file.seek(page * PAGE_BYTES)
        @data = @file.read(PAGE_BYTES).to_s.b.ljust(PAGE_BYTES, "\0")
        @page = page
        @dirty = false
      end
      offset = byte % PAGE_BYTES
      mask = 1 << (sequence % 8)
      return false if (@data.getbyte(offset) & mask).positive?

      @data.setbyte(offset, @data.getbyte(offset) | mask)
      @dirty = true
      true
    end

    def close
      @file.close!
    end
  end
end
