export class PartialFdrFile {
  /**
   * @param {string} deviceId
   * @param {{ fileIndex: number, sha256: string, sizeBytes: number }} manifest
   */
  static async open(deviceId, manifest) {
    if (!navigator.storage?.getDirectory) return new MemoryPartialFdrFile()
    const root = await navigator.storage.getDirectory()
    const directory = await root.getDirectoryHandle("sillage-fdr-sync", { create: true })
    const filename = `${deviceId}-${manifest.fileIndex}-${manifest.sha256}.partial`.replace(/[^a-zA-Z0-9_.-]/g, "-")
    const handle = await directory.getFileHandle(filename, { create: true })
    const existing = await handle.getFile()
    if (existing.size > manifest.sizeBytes) {
      const reset = await handle.createWritable()
      await reset.close()
    }
    const file = await handle.getFile()
    const instance = new PartialFdrFile(directory, handle, filename, file.size)
    instance.writable = await handle.createWritable({ keepExistingData: true })
    return instance
  }

  /**
   * @param {FileSystemDirectoryHandle} directory
   * @param {FileSystemFileHandle} handle
   * @param {string} filename
   * @param {number} size
   */
  constructor(directory, handle, filename, size) {
    this.directory = directory
    this.handle = handle
    this.filename = filename
    this.size = size
    /** @type {FileSystemWritableFileStream | null} */
    this.writable = null
  }

  /** @param {number} offset @param {Uint8Array} bytes */
  async append(offset, bytes) {
    if (!this.writable) throw new Error("The partial FDR file is closed.")
    await this.writable.write({ type: "write", position: offset, data: ownedArrayBuffer(bytes) })
    this.size = Math.max(this.size, offset + bytes.length)
  }

  async close() {
    if (!this.writable) return
    await this.writable.close()
    this.writable = null
  }

  async blob() {
    await this.close()
    return this.handle.getFile()
  }

  async remove() {
    await this.close()
    await this.directory.removeEntry(this.filename)
  }
}

export class MemoryPartialFdrFile {
  constructor() {
    this.size = 0
    /** @type {ArrayBuffer[]} */
    this.chunks = []
  }

  /** @param {number} offset @param {Uint8Array} bytes */
  async append(offset, bytes) {
    if (offset !== this.size) throw new Error("The in-memory FDR transfer cannot resume out of order.")
    this.chunks.push(ownedArrayBuffer(bytes))
    this.size += bytes.length
  }

  async close() {}
  async blob() { return new Blob(this.chunks, { type: "application/octet-stream" }) }
  async remove() { this.chunks = [] }
}

/** @param {Uint8Array} bytes */
function ownedArrayBuffer(bytes) {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy.buffer
}
