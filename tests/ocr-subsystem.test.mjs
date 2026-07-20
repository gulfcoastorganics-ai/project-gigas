import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { generateOcrCandidates } from '../src/editorial/transcription/transcription-stages.js';

const TEST_RUN_DIR = '/tmp/test-run';

test('generateOcrCandidates should handle blocked state when no provider configured', async () => {
  const context = { sourceId: 'test-source', page: 1 };
  
  // Ensure the directory exists to mimic real usage
  await fs.mkdir(path.join(TEST_RUN_DIR, 'transcription'), { recursive: true });
  
  const result = await generateOcrCandidates(TEST_RUN_DIR, context);
  
  assert.strictEqual(result.status, 'blocked');
  assert.strictEqual(result.reason, 'No OCR provider configured');
  
  const runFile = await fs.readFile(path.join(TEST_RUN_DIR, 'transcription', 'ocr-run.json'), 'utf8');
  assert.strictEqual(JSON.parse(runFile).status, 'blocked');
});
