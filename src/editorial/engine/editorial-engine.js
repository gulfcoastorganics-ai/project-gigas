import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export class EditorialEngine {
  constructor(config = {}) {
    this.root = config.root || process.cwd();
  }

  async createRun(sourceId, page) {
    const runId = randomUUID();
    const runDir = path.join(this.root, 'data', 'candidates', 'editorial', sourceId, `page-${String(page).padStart(4, '0')}`, 'runs', runId);
    
    await fs.mkdir(runDir, { recursive: true });
    
    const manifest = {
      runId,
      sourceId,
      page,
      startedAt: new Date().toISOString(),
      stages: {}
    };
    
    await fs.writeFile(path.join(runDir, 'run.json'), JSON.stringify(manifest, null, 2));
    
    return { runId, runDir };
  }
}
