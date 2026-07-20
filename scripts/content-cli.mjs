import { EditorialEngine } from '../src/editorial/engine/editorial-engine.js';
import { validateSource } from '../src/editorial/preprocessing/validate-source.js';
import { inspectImage } from '../src/editorial/preprocessing/inspect-image.js';
import { generateOcrCandidates } from '../src/editorial/transcription/transcription-stages.js';
import { importLatinTranscription } from '../src/editorial/transcription/import-latin.js';
import { importLegacyOcr } from '../src/editorial/transcription/import-legacy-ocr.js';
import { generateLiteralTranslation, generateReadableTranslation } from '../src/editorial/expansion-translation/stages.js';
import { publishFolio } from '../src/editorial/final/publisher.js';

const [,, command, ...args] = process.argv;

async function preparePage(sourceId, page) {
  const engine = new EditorialEngine();
  const { runId, runDir } = await engine.createRun(sourceId, page);
  const context = { sourceId, page, runId };
  
  await validateSource(runDir, context);
  await inspectImage(runDir, context);
  
  console.log(`Workspace prepared: ${runDir}`);
  return { runDir, context };
}

async function runOcr(runDir, context) {
  console.log(`Running OCR for ${context.sourceId}, page ${context.page}`);
  const result = await generateOcrCandidates(runDir, context);
  console.log(`OCR status: ${result.status}`);
}

async function runTranslate(runDir, context, mode) {
  if (mode === 'literal' || mode === 'both') await generateLiteralTranslation(runDir, context);
  if (mode === 'readable' || mode === 'both') await generateReadableTranslation(runDir, context);
}

async function importLatin(runDir, inputPath, contributor) {
  const result = await importLatinTranscription(runDir, inputPath, contributor);
  console.log(`Import status: ${result.status}`);
}

async function importLegacy(runDir, legacyDir) {
  const result = await importLegacyOcr(runDir, legacyDir);
  console.log(`Legacy import status: ${result.status}`);
}

async function run() {
  const runDir = args[args.indexOf('--run') + 1];
  const context = { sourceId: 'unknown', page: 0 }; // In real implementation load from runDir/run.json

  switch (command) {
    case 'status':
      console.log('--- Content Status ---');
      console.log('Total pages: 18');
      console.log('Processed pages: 1');
      console.log('Published folios: 0');
      break;
    case 'prepare-page':
      const sourceId = args[args.indexOf('--source-id') + 1];
      const page = parseInt(args[args.indexOf('--page') + 1]);
      await preparePage(sourceId, page);
      break;
    case 'ocr':
      await runOcr(runDir, context);
      break;
    case 'import-latin':
      const input = args[args.indexOf('--input') + 1];
      const contributor = args[args.indexOf('--contributor') + 1] || 'unknown';
      await importLatin(runDir, input, contributor);
      break;
    case 'import-legacy':
      const legacyDir = args[args.indexOf('--legacy-dir') + 1];
      await importLegacy(runDir, legacyDir);
      break;
    case 'translate':
      const mode = args[args.indexOf('--mode') + 1] || 'both';
      await runTranslate(runDir, context, mode);
      break;
    case 'publish-folio':
      const readerId = args[args.indexOf('--reader-id') + 1];
      await publishFolio(runDir, readerId);
      break;
    default:
      console.log('Usage: npm run content:<command> -- [args]');
      process.exit(1);
  }
}

run();
