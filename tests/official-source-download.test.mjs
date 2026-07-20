import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { syncMetadata, parseIiifManifest, downloadPage, sourceStoragePreflight } from '../src/manuscript/official-source.js'

test('IIIF manifest parsing preserves canvas and image service metadata', () => {
  const pages = parseIiifManifest({
    items: [{
      id: 'canvas-1',
      label: { en: ['Page 1'] },
      items: [{
        items: [{
          body: {
            id: 'image-1',
            width: 100,
            height: 120,
            service: [{ id: 'https://www.manuscripta.se/iiif/1' }]
          }
        }]
      }]
    }]
  })
  assert.equal(pages[0].canvasId, 'canvas-1')
  assert.equal(pages[0].imageServiceId, 'https://www.manuscripta.se/iiif/1')
  assert.equal(pages[0].folioLabel, null)
})

test('metadata sync and page download preserve provenance and checksum', async () => {
  const image = fs.readFileSync('public/folios/real/002r.jpg')
  const fetchMock = async (url) => url.includes('manifest')
    ? new Response(JSON.stringify({
        items: [{
          id: 'canvas-1',
          items: [{
            items: [{
              body: {
                id: 'https://www.manuscripta.se/image/1/full/full/0/default.jpg',
                width: 900,
                height: 1407,
                service: [{ id: 'https://www.manuscripta.se/iiif/1' }]
              }
            }]
          }]
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    : url.includes('libris')
      ? new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response(image, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(image.length), 'accept-ranges': 'bytes' } })

  await syncMetadata(fetchMock)
  const result = await downloadPage('external-459e4da71e7fd69d189a8196c9d9a9beb03026e4bbbdce06b37dec39a74981a0', 1, 'review', fetchMock)
  assert.equal(result.contentType, 'image/jpeg')
  assert.equal(result.bytes, image.length)
  assert.match(result.sha256, /^[a-f0-9]{64}$/)
  assert.equal(result.license, 'CC BY 4.0')
  assert.equal(fs.existsSync(`${result.path}.manifest.json`), true)
})

test('storage preflight reports required space', () => {
  const result = sourceStoragePreflight(1024, 'page')
  assert.ok(result.requiredBytes > result.expectedBytes)
  assert.equal(result.shortfall, 0)
})

test('official-host restriction blocks untrusted domains', async () => {
  const { streamDownload } = await import('../src/manuscript/official-source.js')
  await assert.rejects(
    streamDownload('https://evil.com/image.jpg', 'data/sources/downloads/temp-evil.jpg', 0, async () => new Response('')),
    /untrusted_source_host/
  )
})

test('HTML response rejection throws on non-image MIME type', async () => {
  const { streamDownload } = await import('../src/manuscript/official-source.js')
  const fetchMock = async (url) => {
    return new Response('<html>Error</html>', { status: 200, headers: { 'content-type': 'text/html' } })
  }
  await assert.rejects(
    streamDownload('https://manuscripta.se/image.jpg', 'data/sources/downloads/temp-html.jpg', 0, fetchMock),
    /unexpected_content_type/
  )
})

test('insufficient storage preflight blocks download', () => {
  assert.throws(
    () => sourceStoragePreflight(100 * 1024 ** 4, 'full'),
    /insufficient_storage/
  )
})

test('resumable partial download appends correctly', async () => {
  const dest = 'data/sources/downloads/test-resume.pdf'
  const partial = `${dest}.partial`
  const sidecar = `${dest}.download.json`
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.rmSync(dest, { force: true })
  fs.rmSync(partial, { force: true })
  fs.rmSync(sidecar, { force: true })

  fs.writeFileSync(partial, 'part1')
  fs.writeFileSync(sidecar, JSON.stringify({ url: 'https://kb.se/test.pdf', etag: 'etag-1', startTime: new Date().toISOString() }))

  const fetchMock = async (url, init) => {
    assert.equal(init.headers.range, 'bytes=5-')
    return new Response('part2', {
      status: 206,
      headers: {
        'content-type': 'application/pdf',
        'content-length': '5',
        'etag': 'etag-1'
      }
    })
  }

  const { streamDownload } = await import('../src/manuscript/official-source.js')
  const result = await streamDownload('https://kb.se/test.pdf', dest, 10, fetchMock)
  assert.equal(result.bytes, 10)
  assert.equal(fs.readFileSync(dest, 'utf8'), 'part1part2')

  fs.rmSync(dest, { force: true })
  fs.rmSync(sidecar, { force: true })
})

test('changed ETag restarts download from scratch', async () => {
  const dest = 'data/sources/downloads/test-etag.pdf'
  const partial = `${dest}.partial`
  const sidecar = `${dest}.download.json`
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.rmSync(dest, { force: true })
  fs.rmSync(partial, { force: true })
  fs.rmSync(sidecar, { force: true })

  fs.writeFileSync(partial, 'part1')
  fs.writeFileSync(sidecar, JSON.stringify({ url: 'https://kb.se/test.pdf', etag: 'etag-old', startTime: new Date().toISOString() }))

  let cleanRequestMade = false
  const fetchMock = async (url, init) => {
    if (init?.headers?.range) {
      return new Response('should-not-use-this', {
        status: 206,
        headers: {
          'content-type': 'application/pdf',
          'content-length': '18',
          'etag': 'etag-new'
        }
      })
    }
    cleanRequestMade = true
    return new Response('freshcontent', {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': '12',
        'etag': 'etag-new'
      }
    })
  }

  const { streamDownload } = await import('../src/manuscript/official-source.js')
  const result = await streamDownload('https://kb.se/test.pdf', dest, 12, fetchMock)
  assert.equal(cleanRequestMade, true)
  assert.equal(result.bytes, 12)
  assert.equal(fs.readFileSync(dest, 'utf8'), 'freshcontent')

  fs.rmSync(dest, { force: true })
  fs.rmSync(sidecar, { force: true })
})

test('cache-pruning safety preserves manifests and downloaded pages', async () => {
  const { pruneCache } = await import('../src/manuscript/official-source.js')
  
  fs.mkdirSync('data/derived', { recursive: true })
  fs.writeFileSync('data/derived/reproducible.txt', 'reproducible')
  fs.writeFileSync('data/sources/downloads/temp.partial', 'partial')
  fs.mkdirSync('data/sources/pages/test-source', { recursive: true })
  fs.writeFileSync('data/sources/pages/test-source/source-page-0001.jpg', 'source')
  fs.writeFileSync('data/sources/pages/test-source/source-page-0001.jpg.manifest.json', '{}')

  const removed = pruneCache()
  
  assert.ok(removed.some(r => r.endsWith('reproducible.txt')))
  assert.ok(removed.some(r => r.endsWith('temp.partial')))
  
  assert.ok(fs.existsSync('data/sources/pages/test-source/source-page-0001.jpg'))
  assert.ok(fs.existsSync('data/sources/pages/test-source/source-page-0001.jpg.manifest.json'))

  fs.rmSync('data/sources/pages/test-source', { recursive: true, force: true })
})
