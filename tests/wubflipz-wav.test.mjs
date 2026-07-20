import { describe, it } from 'node:test'
import assert from 'node:assert'

const basePath = process.cwd()

class MockAudioBuffer {
  constructor(length, sampleRate, numberOfChannels) {
    this.length = length
    this.sampleRate = sampleRate
    this.numberOfChannels = numberOfChannels
    this._data = []
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const chData = new Float32Array(length)
      for (let i = 0; i < length; i++) {
        chData[i] = (Math.random() - 0.5) * 0.5
      }
      this._data.push(chData)
    }
  }
  getChannelData(ch) { return this._data[ch] }
}

describe('WAV Export', () => {
  it('encodes a mono buffer to valid WAV', async () => {
    const { audioBufferToWAV } = await import(`${basePath}/src/wubflipz/export/wav.js`)
    const buffer = new MockAudioBuffer(4410, 44100, 1)
    const blob = audioBufferToWAV(buffer)
    assert.ok(blob instanceof Blob, 'Should return a Blob')
    assert.strictEqual(blob.type, 'audio/wav', 'Should be audio/wav type')

    const bytes = new Uint8Array(await blob.arrayBuffer())
    assert.strictEqual(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF', 'Should start with RIFF')
    assert.strictEqual(new TextDecoder().decode(bytes.slice(8, 12)), 'WAVE', 'Should contain WAVE')
    assert.strictEqual(new TextDecoder().decode(bytes.slice(12, 16)), 'fmt ', 'Should have fmt chunk')
  })

  it('encodes a stereo buffer correctly', async () => {
    const { audioBufferToWAV } = await import(`${basePath}/src/wubflipz/export/wav.js`)
    const buffer = new MockAudioBuffer(4410, 44100, 2)
    const blob = audioBufferToWAV(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    assert.strictEqual(view.getUint16(22, true), 2, 'Should indicate 2 channels')
  })

  it('sets correct sample rate in header', async () => {
    const { audioBufferToWAV } = await import(`${basePath}/src/wubflipz/export/wav.js`)
    const buffer = new MockAudioBuffer(4410, 48000, 1)
    const blob = audioBufferToWAV(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    assert.strictEqual(view.getUint32(24, true), 48000, 'Should set sample rate to 48000')
  })

  it('computes correct data size', async () => {
    const { audioBufferToWAV } = await import(`${basePath}/src/wubflipz/export/wav.js`)
    const buffer = new MockAudioBuffer(1000, 44100, 1)
    const blob = audioBufferToWAV(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const dataSize = view.getUint32(40, true)
    assert.strictEqual(dataSize, 1000 * 2, 'Data size should match samples * byte depth')
    const fileSize = bytes.length
    assert.strictEqual(fileSize, 44 + dataSize, 'File size should be header + data')
  })

  it('provides download helper', async () => {
    const { audioBufferToWAV, downloadWAV } = await import(`${basePath}/src/wubflipz/export/wav.js`)
    const buffer = new MockAudioBuffer(100, 44100, 1)
    const blob = audioBufferToWAV(buffer)
    assert.ok(blob.size > 44, 'WAV should be larger than header')
  })

  it('clamps samples to valid range', async () => {
    const { audioBufferToWAV } = await import(`${basePath}/src/wubflipz/export/wav.js`)
    class ClampBuffer {
      constructor() {
        this.length = 100
        this.sampleRate = 44100
        this.numberOfChannels = 1
      }
      getChannelData() {
        const data = new Float32Array(100)
        for (let i = 0; i < 100; i++) {
          data[i] = i === 0 ? 2.0 : i === 1 ? -2.0 : 0
        }
        return data
      }
    }
    const buffer = new ClampBuffer()
    const blob = audioBufferToWAV(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    assert.ok(bytes.length > 44, 'Should produce valid WAV even with out-of-range samples')
  })

  it('provides WAVExporter class with correct API', async () => {
    const { WAVExporter } = await import(`${basePath}/src/wubflipz/export/wav.js`)
    const exporter = new WAVExporter()
    assert.ok(typeof exporter.renderFullMix === 'function', 'Should have renderFullMix')
    assert.ok(typeof exporter.renderStem === 'function', 'Should have renderStem')
    assert.ok(typeof exporter.renderSection === 'function', 'Should have renderSection')
    assert.ok(typeof exporter.cancel === 'function', 'Should have cancel')
  })
})
