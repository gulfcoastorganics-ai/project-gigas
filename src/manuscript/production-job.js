export const productionSegments = [[30, 39], [40, 49], [50, 59], [60, 69], [70, 79], [80, 89], [90, 99]]
export const productionPolicy = { provider: 'mistral-ocr', model: 'mistral-ocr-4-0', concurrency: 1, timeoutMs: 180000, delayMs: 2000, minimumUsableRegionRate: 0.85, minimumOverallUsableRegionRate: 0.9, canonical: false, candidateOnly: true, reviewRequired: true }

export function productionSegmentsForRange(from, to) {
  const segments = []
  for (let start = from; start <= to; start += 10) segments.push([start, Math.min(start + 9, to)])
  return segments
}

export function usableRegionRate(job) {
  const regions = job.pages.flatMap((page) => page.regions || [])
  return regions.length ? regions.filter((region) => region.state === 'completed').length / regions.length : 0
}

export function segmentLabel(range) { return `${range[0]}-${range[1]}` }

export function mistralEnvironment(env = process.env) {
  const model = env.GIGAS_MISTRAL_OCR_MODEL || 'mistral-ocr-4-0'
  if (model !== 'mistral-ocr-4-0') throw new Error('incompatible_mistral_ocr_model')
  const next = { ...env, GIGAS_VISION_PROVIDER: 'mistral-ocr', GIGAS_MISTRAL_OCR_MODEL: model }
  for (const key of ['GIGAS_VISION_MODEL', 'GIGAS_VISION_MODEL_2', 'GIGAS_VISION_FALLBACK_MODELS', 'GIGAS_GEMINI_THINKING_LEVEL', 'GIGAS_GEMINI_THINKING_BUDGET']) delete next[key]
  return next
}
