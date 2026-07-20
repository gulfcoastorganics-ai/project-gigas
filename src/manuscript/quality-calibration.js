function sorted(values) { return [...values].filter(Number.isFinite).sort((a, b) => a - b) }

export function percentile(values, p) {
  const xs = sorted(values); if (!xs.length) return 0
  const index = (xs.length - 1) * p; const lower = Math.floor(index); const upper = Math.ceil(index)
  return xs[lower] + (xs[upper] - xs[lower]) * (index - lower)
}

export function statistics(values) {
  const xs = sorted(values); if (!xs.length) return { count: 0, median: 0, mean: 0, standardDeviation: 0, q1: 0, q3: 0, iqr: 0, percentile95: 0 }
  const mean = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const variance = xs.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / xs.length
  const q1 = percentile(xs, .25); const q3 = percentile(xs, .75)
  return { count: xs.length, median: percentile(xs, .5), mean, standardDeviation: Math.sqrt(variance), q1, q3, iqr: q3 - q1, percentile95: percentile(xs, .95) }
}

export function duplicateLineRate(lines = []) {
  const values = lines.map((line) => String(line.diplomaticLatin ?? line.text ?? '').trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean)
  if (!values.length) return 0
  const counts = new Map(); for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  return values.filter((value) => counts.get(value) > 1).length / values.length
}

export function repeatedParagraphs(lines = []) {
  const values = lines.map((line) => String(line.diplomaticLatin ?? line.text ?? '').trim().toLowerCase()).filter(Boolean)
  for (let i = 0; i < values.length - 3; i++) for (let j = i + 1; j < values.length - 2; j++) {
    if (values[i] === values[j] && values[i + 1] === values[j + 1] && values[i + 2] === values[j + 2]) return true
  }
  return false
}

export function calibrateQuality(regions = []) {
  const lineCounts = regions.map((region) => region.lines?.length || 0)
  const densities = regions.map((region) => {
    const height = Number(region.height || region.nativeBox?.height || region.crop?.dimensions?.height || 0)
    return height > 0 ? (region.lines?.length || 0) / height * 1000 : 0
  })
  return {
    schemaVersion: '1.0',
    ruleVersion: 'robust-production-v1',
    calibrationDataset: 'official-pages-30-99',
    lineCount: statistics(lineCounts),
    lineDensityPer1000VerticalPixels: statistics(densities),
    emergencyCeiling: Math.max(200, Math.ceil(percentile(lineCounts, .75) + 6 * (percentile(lineCounts, .75) - percentile(lineCounts, .25)))),
    calibratedAt: new Date().toISOString()
  }
}

export function qualityWarnings(lines = [], context = {}, calibration = null) {
  const warnings = []; const texts = lines.map((line) => String(line.diplomaticLatin ?? line.text ?? '').trim()).filter(Boolean)
  const counts = new Map(); for (const text of texts) counts.set(text, (counts.get(text) || 0) + 1)
  const stats = calibration?.lineCount
  const q3 = stats?.q3 ?? Infinity; const iqr = stats?.iqr ?? 0
  if (stats && lines.length > q3 + 3 * iqr) warnings.push('line_count_outlier_robust_threshold')
  const height = Number(context.height || context.nativeBox?.height || context.crop?.dimensions?.height || 0)
  const density = height > 0 ? lines.length / height * 1000 : 0
  if (calibration?.lineDensityPer1000VerticalPixels && density > calibration.lineDensityPer1000VerticalPixels.percentile95) warnings.push('line_density_above_calibrated_95th_percentile')
  if (calibration && lines.length > calibration.emergencyCeiling) warnings.push('line_count_emergency_ceiling_review_required')
  if (duplicateLineRate(lines) > .1) warnings.push('duplicate_line_rate_above_10_percent')
  if (repeatedParagraphs(lines)) warnings.push('repeated_paragraph_sequence_review_required')
  if (texts.some((text) => /\b(the|this|image|shows|manuscript|page|column|appears|visible|description)\b/i.test(text))) warnings.push('explanatory_prose_in_transcription_field')
  if (lines.length > 2 && lines.every((line) => Number(line.confidence ?? 0) === 1)) warnings.push('uniformly_perfect_confidence_review_required')
  return warnings
}

export function crossPageDuplication(pages = []) {
  const findings = []; const seen = new Map()
  for (const page of pages) for (const region of page.regions || []) {
    const text = (region.lines || []).map((line) => String(line.diplomaticLatin ?? line.text ?? '').trim()).filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ')
    if (text.length < 100) continue
    if (seen.has(text) && seen.get(text).page !== page.page) findings.push({ issue: 'identical_long_region_output', pages: [seen.get(text).page, page.page], regions: [seen.get(text).regionId, region.regionId], reviewRequired: true })
    else seen.set(text, { page: page.page, regionId: region.regionId })
  }
  return findings
}
