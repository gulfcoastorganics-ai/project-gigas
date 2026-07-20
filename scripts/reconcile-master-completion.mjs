import { buildMasterCompletionIndex } from '../src/manuscript/master-completion.js'
const result = buildMasterCompletionIndex(); console.log(JSON.stringify({ inventoryCount: result.inventoryCount, counts: result.counts, output: 'data/candidates/master-edition/completion-index.json', canonical: false }, null, 2))
