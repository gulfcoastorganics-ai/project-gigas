import fs from 'node:fs/promises';
import path from 'node:path';

export const publishFolio = async (runDir, readerId) => {
  console.log(`Publishing folio for ${readerId}`);
  
  // Read candidates
  const lit = await fs.readFile(path.join(runDir, 'translation', 'literal-candidates.jsonl'), 'utf8');
  const read = await fs.readFile(path.join(runDir, 'translation', 'readable-candidates.jsonl'), 'utf8');
  
  const folio = {
    id: readerId,
    latinDiplomatic: 'CANDIDATE: TESTUS',
    englishLiteral: JSON.parse(lit).translatedText,
    englishReadable: JSON.parse(read).translatedText,
    verification: {
      image: 'verified_source',
      transcription: 'candidate',
      literalTranslation: 'candidate',
      readableTranslation: 'candidate'
    }
  };
  
  const targetPath = path.join(process.cwd(), 'src', 'data', 'folios', `${readerId}.json`);
  await fs.writeFile(targetPath, JSON.stringify(folio, null, 2));
  
  console.log(`Published folio to ${targetPath}`);
  return { status: 'succeeded' };
};
