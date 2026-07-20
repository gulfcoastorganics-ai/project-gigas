import fs from 'node:fs';
import path from 'node:path';

function validate(folio) {
  const errors = [];
  
  if (!folio.sourceId) errors.push('Missing sourceId');
  if (!folio.image || folio.image.includes('placeholder')) errors.push('Missing valid image');
  
  // Example validation rule
  if (folio.latinDiplomatic === '' && folio.verification.transcription !== 'unavailable') {
    errors.push('Empty transcription must be marked unavailable');
  }

  return errors;
}

const [,, file] = process.argv;
const folio = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = validate(folio);

if (errors.length > 0) {
  console.error('Validation failed:', errors);
  process.exit(1);
}
console.log('Validation passed');
