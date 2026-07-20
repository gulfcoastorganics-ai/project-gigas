import fs from 'node:fs/promises';
import path from 'node:path';

export const importLegacyOcr = async (runDir, legacyDir) => {
  console.log(`Importing legacy OCR from ${legacyDir}`);
  // Logic to find and map artifacts:
  // - ocr-candidates.jsonl (new format)
  // - provider-result.json (legacy)
  // - page-package.json (legacy)
  
  const legacyCandidatesFile = path.join(legacyDir, 'page-candidate.json');
  try {
    const data = await fs.readFile(legacyCandidatesFile, 'utf8');
    const legacy = JSON.parse(data);
    
    // Map to new schema
    const candidate = {
      candidateId: `imp-${Date.now()}`,
      lineId: 'l1', // Placeholder: must link properly in real implementation
      provider: legacy.provider || 'legacy-batch',
      rawText: legacy.rawText || legacy.text || '',
      normalizedText: legacy.text || '',
      createdAt: new Date().toISOString()
    };
    
    const transDir = path.join(runDir, 'transcription');
    await fs.mkdir(transDir, { recursive: true });
    await fs.writeFile(path.join(transDir, 'ocr-candidates.jsonl'), JSON.stringify(candidate) + '\n');
    return { status: 'succeeded' };
  } catch (e) {
    console.error('Import failed', e);
    return { status: 'failed', reason: e.message };
  }
};
