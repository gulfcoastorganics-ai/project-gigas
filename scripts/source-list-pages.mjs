import { listPages } from '../src/manuscript/official-source.js'
try { console.log(JSON.stringify(listPages(), null, 2)) } catch (error) { console.error(`ERROR: ${error.message}`); process.exit(1) }
