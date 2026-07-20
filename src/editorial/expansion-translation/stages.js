import fs from 'node:fs/promises';
import path from 'node:path';

export const generateExpansionCandidates = async (runDir, context) => {
  const data = [{ candidateId: 'ec1', diplomaticId: 'dc1', expandedText: 'TESTUS' }];
  await fs.mkdir(path.join(runDir, 'expansion'), { recursive: true });
  await fs.writeFile(path.join(runDir, 'expansion', 'expansion-candidates.jsonl'), JSON.stringify(data[0]) + '\n');
  return { status: 'succeeded' };
};

export const generateLiteralTranslation = async (runDir, context) => {
  const data = [{ candidateId: 'lc1', lineId: 'l1', translatedText: 'I TEST' }];
  await fs.mkdir(path.join(runDir, 'translation'), { recursive: true });
  await fs.writeFile(path.join(runDir, 'translation', 'literal-candidates.jsonl'), JSON.stringify(data[0]) + '\n');
  return { status: 'succeeded' };
};

export const generateReadableTranslation = async (runDir, context) => {
  const data = [{ candidateId: 'rc1', literalId: 'lc1', translatedText: 'I am testing' }];
  await fs.writeFile(path.join(runDir, 'translation', 'readable-candidates.jsonl'), JSON.stringify(data[0]) + '\n');
  return { status: 'succeeded' };
};
