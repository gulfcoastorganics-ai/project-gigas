import { pruneCache } from '../src/manuscript/official-source.js'
console.log(JSON.stringify({ removed: pruneCache(), policy: 'archival sources, manifests, raw responses, review packages, and canonical data are never pruned' }, null, 2))
