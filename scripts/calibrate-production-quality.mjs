import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, root } from '../src/manuscript/source-ingestion.js'
import { loadJob, jobDirectory, atomicJson } from '../src/manuscript/batch-pipeline.js'
import { calibrateQuality, qualityWarnings, crossPageDuplication } from '../src/manuscript/quality-calibration.js'

const args = parseArgs(process.argv.slice(2))
const productionId = args['production-job'] || 'production-2026-07-14T06-02-28-305Z-26543'
const productionDir = path.join(root, 'data/candidates/production-jobs', productionId)
const productionFile = path.join(productionDir, 'production-job.json')
const production = JSON.parse(fs.readFileSync(productionFile, 'utf8'))
const jobs = production.segments.filter((segment) => segment.jobId).map((segment) => loadJob(segment.jobId))
const regionRecords = []
for (const job of jobs) for (const page of job.pages) for (const region of page.regions || []) {
  const candidateFile = path.join(jobDirectory(job.jobId), `pages/page-${String(page.page).padStart(4, '0')}/regions`, region.regionId, 'candidate.json')
  if (!fs.existsSync(candidateFile)) continue
  const candidate = JSON.parse(fs.readFileSync(candidateFile, 'utf8'))
  const regionMeta = JSON.parse(fs.readFileSync(path.join(jobDirectory(job.jobId), `pages/page-${String(page.page).padStart(4, '0')}/regions`, region.regionId, 'region.json'), 'utf8'))
  regionRecords.push({ page: page.page, regionId: region.regionId, lines: candidate.lines || [], height: regionMeta.nativeBox?.height || 0, nativeBox: regionMeta.nativeBox })
}
const calibration = calibrateQuality(regionRecords)
const pageReports = []
for (const job of jobs) for (const page of job.pages) {
  const pageFile = path.join(jobDirectory(job.jobId), `pages/page-${String(page.page).padStart(4, '0')}/page-candidate.json`)
  if (!fs.existsSync(pageFile)) continue
  const candidate = JSON.parse(fs.readFileSync(pageFile, 'utf8'))
  const regions = regionRecords.filter((region) => region.page === page.page)
  const newWarnings = [...new Set(regions.flatMap((region) => qualityWarnings(region.lines, region, calibration)))]
  const oldWarnings = candidate.plausibilityWarnings || []
  candidate.plausibilityWarnings = newWarnings
  candidate.qualityWarningRuleVersion = calibration.ruleVersion
  atomicJson(pageFile, candidate)
  pageReports.push({ page: page.page, oldWarnings, newWarnings, regionCount: regions.length })
}
const report = {
  ...calibration,
  productionId,
  oldWarningCount: pageReports.filter((page) => page.oldWarnings.length).length,
  newWarningCount: pageReports.filter((page) => page.newWarnings.length).length,
  pagesStillFlagged: pageReports.filter((page) => page.newWarnings.length).map((page) => ({ page: page.page, reasons: page.newWarnings })),
  likelyFalsePositivesRemoved: pageReports.filter((page) => page.oldWarnings.length && !page.newWarnings.length).map((page) => page.page),
  duplicateFindings: crossPageDuplication(regionRecords.map((region) => ({ page: region.page, regions: [region] }))),
  pages: pageReports,
  generatedAt: new Date().toISOString(),
  canonical: false,
  candidateOnly: true
}
atomicJson(path.join(productionDir, 'quality-calibration.json'), report)
atomicJson(path.join(root, 'data/candidates/production-jobs/quality-calibration-latest.json'), { productionId, path: path.relative(root, path.join(productionDir, 'quality-calibration.json')), ruleVersion: report.ruleVersion, canonical: false, candidateOnly: true })
console.log(JSON.stringify({ productionId, calibrationPath: path.join(productionDir, 'quality-calibration.json'), oldWarningCount: report.oldWarningCount, newWarningCount: report.newWarningCount, pagesStillFlagged: report.pagesStillFlagged, duplicateFindings: report.duplicateFindings }, null, 2))
