import fs from 'node:fs/promises';
import path from 'node:path';

export const importLatinTranscription = async (runDir, inputPath, contributor) => {
  console.log(`Importing Latin from ${inputPath}`);
  
  const content = await fs.readFile(inputPath, 'utf8');
  const diplomatic = {
    candidateId: `dc-${Date.now()}`,
    text: content,
    contributor,
    timestamp: new Date().toISOString()
  };
  
  const transDir = path.join(runDir, 'transcription');
  await fs.mkdir(transDir, { recursive: true });
  await fs.writeFile(path.join(transDir, 'diplomatic-candidates.jsonl'), JSON.stringify(diplomatic) + '\n');
  
  return { status: 'succeeded' };
};
