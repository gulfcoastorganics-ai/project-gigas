import { EditorialEngine } from '../src/editorial/engine/editorial-engine.js';
import { PipelineRunner } from '../src/editorial/engine/pipeline-runner.js';
import { StageRegistry } from '../src/editorial/engine/stage-registry.js';
// ... (imports)

const registry = new StageRegistry();
// ... (register all stages)

async function finishAll() {
  const progress = JSON.parse(await fs.readFile('data/content-progress.json', 'utf8'));
  const engine = new EditorialEngine();
  const runner = new PipelineRunner(engine, registry);
  
  for (const pageRecord of progress) {
    if (pageRecord.publicationStatus === 'published') continue;
    
    console.log(`Processing page ${pageRecord.page}...`);
    // ... orchestrate stages ...
    
    // Save progress atomically
    await fs.writeFile('data/content-progress.json', JSON.stringify(progress, null, 2));
  }
}

// ... (CLI logic)
