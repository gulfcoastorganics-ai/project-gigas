import { EditorialEngine } from '../src/editorial/engine/editorial-engine.js';
import { PipelineRunner } from '../src/editorial/engine/pipeline-runner.js';
import { StageRegistry } from '../src/editorial/engine/stage-registry.js';
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
import { validateEditorialRun } from '../src/editorial/final/validate-editorial-run.js';

const registry = new StageRegistry();
const STAGES = [
  { id: 'validate-source', fn: validateSource },
  { id: 'inspect-image', fn: inspectImage },
  { id: 'preprocess-image', fn: preprocessImage },
  { id: 'detect-regions', fn: detectRegions },
  { id: 'detect-columns', fn: detectColumns },
  { id: 'detect-lines', fn: detectLines },
  { id: 'determine-reading-order', fn: determineReadingOrder },
  { id: 'generate-ocr-candidates', fn: generateOcrCandidates },
  { id: 'normalize-diplomatic-transcription', fn: normalizeDiplomaticTranscription },
  { id: 'generate-expansion-candidates', fn: generateExpansionCandidates },
  { id: 'generate-literal-translation', fn: generateLiteralTranslation },
  { id: 'generate-readable-translation', fn: generateReadableTranslation },
  { id: 'align-lines', fn: alignLines },
  { id: 'fuse-evidence', fn: fuseEvidence },
  { id: 'calculate-confidence', fn: calculateConfidence },
  { id: 'detect-issues', fn: detectIssues },
  { id: 'validate-editorial-run', fn: validateEditorialRun },
  { id: 'export-review-package', fn: exportReviewPackage }
];

STAGES.forEach(s => registry.register(s.id, s.fn));

async function runPipeline(sourceId, page, engine, runner) {
  const { runId, runDir } = await engine.createRun(sourceId, page);
  const context = { sourceId, page, runId };
  
  for (const stage of STAGES) {
    try {
      const result = await registry.get(stage.id)(runDir, context);
      console.log(`Stage ${stage.id}: ${result.status}`);
      // Atomically update run.json here
    } catch (e) {
      console.error(`Stage ${stage.id} failed:`, e);
      break;
    }
  }
  console.log(`Run completed: ${runDir}`);
}

const [,, command, ...args] = process.argv;

const engine = new EditorialEngine();
const runner = new PipelineRunner(engine, registry);

if (command === 'process-page') {
  const sourceId = args[args.indexOf('--source-id') + 1];
  const page = parseInt(args[args.indexOf('--page') + 1]);
  runPipeline(sourceId, page, engine, runner);
} else if (command === 'status' || command === 'validate' || command === 'issues' || command === 'export-review') {
  const runPath = args[args.indexOf('--run') + 1];
  console.log(`Running command ${command} on ${runPath}`);
  // Implement actual command logic here
} else {
  console.log('Usage: node scripts/editorial-cli.mjs [process-page|status|validate|issues|export-review] [args]');
  process.exit(1);
}
