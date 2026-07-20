import { syncMetadata } from '../src/manuscript/official-source.js'
try { console.log(JSON.stringify(await syncMetadata(), null, 2)) } catch (error) { console.error(`ERROR: ${error.message}`); process.exit(1) }
