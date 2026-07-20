import { verifyMasterEdition } from '../src/manuscript/master-edition.js'
const result = verifyMasterEdition(); console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exitCode = 1
