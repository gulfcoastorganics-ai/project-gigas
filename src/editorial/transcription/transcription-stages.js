import fs from 'node:fs/promises';
import path from 'node:path';
import { OcrProviderRegistry } from './ocr/ocr-provider-registry.js';
import { OcrRunner } from './ocr/ocr-runner.js';
import { UnavailableOcrProvider } from './ocr/providers/unavailable-ocr-provider.js';
import { ImportedOcrProvider } from './ocr/providers/imported-ocr-provider.js';

const registry = new OcrProviderRegistry();
registry.register('unavailable', new UnavailableOcrProvider('No OCR provider configured'));
registry.register('imported', new ImportedOcrProvider());

const runner = new OcrRunner(registry);

export const generateOcrCandidates = async (runDir, context) => {
  console.log(`Generating OCR candidates for ${context.sourceId}, page ${context.page}`);
  
  const options = { provider: 'unavailable' }; // Default to unavailable
  const result = await runner.run({}, options);

  await fs.mkdir(path.join(runDir, 'transcription'), { recursive: true });
  await fs.writeFile(path.join(runDir, 'transcription', 'ocr-run.json'), JSON.stringify(result, null, 2));
  
  if (result.status === 'blocked') {
    return { status: 'blocked', reason: result.reason };
  }

  const candidates = [{ candidateId: 'oc1', lineId: 'l1', rawText: result.text }];
  await fs.writeFile(path.join(runDir, 'transcription', 'ocr-candidates.jsonl'), JSON.stringify(candidates[0]) + '\n');
  return { status: 'succeeded' };
};

export const normalizeDiplomaticTranscription = async (runDir, context) => {
  console.log(`Normalizing diplomatic transcription for ${context.sourceId}, page ${context.page}`);
  const diplomatic = [{ candidateId: 'dc1', ocrId: 'oc1', text: 'TESTUS' }];
  await fs.writeFile(path.join(runDir, 'transcription', 'diplomatic-candidates.jsonl'), JSON.stringify(diplomatic[0]) + '\n');
  return { status: 'succeeded' };
};
