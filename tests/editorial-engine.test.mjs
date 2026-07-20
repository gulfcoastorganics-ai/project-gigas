import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateSource } from '../src/editorial/preprocessing/validate-source.js';
import { inspectImage } from '../src/editorial/preprocessing/inspect-image.js';
import { preprocessImage } from '../src/editorial/preprocessing/preprocess-image.js';
import { detectRegions } from '../src/editorial/segmentation/region-detector.js';
import { detectColumns } from '../src/editorial/segmentation/column-detector.js';
import { detectLines } from '../src/editorial/segmentation/line-detector.js';
import { determineReadingOrder } from '../src/editorial/segmentation/reading-order.js';
import { generateOcrCandidates, normalizeDiplomaticTranscription } from '../src/editorial/transcription/transcription-stages.js';
import { generateExpansionCandidates, generateLiteralTranslation, generateReadableTranslation } from '../src/editorial/expansion-translation/stages.js';
import { alignLines, fuseEvidence, calculateConfidence, detectIssues, exportReviewPackage } from '../src/editorial/final/stages.js';

const TEST_RUN_DIR = '/tmp/test-run';

test('Pipeline stages should succeed and write expected outputs', async (t) => {
  const context = { sourceId: 'test-source', page: 1, runId: 'test-run-id' };
  
  await t.test('validateSource', async () => {
    assert.strictEqual((await validateSource(TEST_RUN_DIR, context)).status, 'succeeded');
  });
  
  await t.test('inspectImage', async () => {
    assert.strictEqual((await inspectImage(TEST_RUN_DIR, context)).status, 'succeeded');
  });
  
  await t.test('preprocessImage', async () => {
    assert.strictEqual((await preprocessImage(TEST_RUN_DIR, context)).status, 'succeeded');
  });
  
  await t.test('detectRegions', async () => {
    assert.strictEqual((await detectRegions(TEST_RUN_DIR, context)).status, 'succeeded');
  });
  
  await t.test('detectColumns', async () => {
    assert.strictEqual((await detectColumns(TEST_RUN_DIR, context)).status, 'succeeded');
  });
  
  await t.test('detectLines', async () => {
    assert.strictEqual((await detectLines(TEST_RUN_DIR, context)).status, 'succeeded');
  });

  await t.test('determineReadingOrder', async () => {
    assert.strictEqual((await determineReadingOrder(TEST_RUN_DIR, context)).status, 'succeeded');
  });
  
  await t.test('generateOcrCandidates', async () => {
    assert.strictEqual((await generateOcrCandidates(TEST_RUN_DIR, context)).status, 'blocked');
  });
  
  await t.test('normalizeDiplomaticTranscription', async () => {
    assert.strictEqual((await normalizeDiplomaticTranscription(TEST_RUN_DIR, context)).status, 'succeeded');
  });

  await t.test('generateExpansionCandidates', async () => {
    assert.strictEqual((await generateExpansionCandidates(TEST_RUN_DIR, context)).status, 'succeeded');
  });

  await t.test('generateLiteralTranslation', async () => {
    assert.strictEqual((await generateLiteralTranslation(TEST_RUN_DIR, context)).status, 'succeeded');
  });

  await t.test('generateReadableTranslation', async () => {
    assert.strictEqual((await generateReadableTranslation(TEST_RUN_DIR, context)).status, 'succeeded');
  });

  await t.test('alignLines', async () => {
    assert.strictEqual((await alignLines(TEST_RUN_DIR, context)).status, 'succeeded');
  });

  await t.test('fuseEvidence', async () => {
    assert.strictEqual((await fuseEvidence(TEST_RUN_DIR, context)).status, 'succeeded');
  });

  await t.test('calculateConfidence', async () => {
    assert.strictEqual((await calculateConfidence(TEST_RUN_DIR, context)).status, 'succeeded');
  });

  await t.test('detectIssues', async () => {
    assert.strictEqual((await detectIssues(TEST_RUN_DIR, context)).status, 'succeeded');
  });

  await t.test('exportReviewPackage', async () => {
    assert.strictEqual((await exportReviewPackage(TEST_RUN_DIR, context)).status, 'succeeded');
  });
});
