import fs from 'node:fs/promises';
import path from 'node:path';

export const alignLines = async (runDir, context) => {
  const alignment = { alignmentId: 'a1', lineId: 'l1', candidates: ['dc1', 'ec1', 'lc1', 'rc1'] };
  await fs.mkdir(path.join(runDir, 'alignment'), { recursive: true });
  await fs.writeFile(path.join(runDir, 'alignment', 'line-alignments.jsonl'), JSON.stringify(alignment) + '\n');
  return { status: 'succeeded' };
};

export const fuseEvidence = async (runDir, context) => {
  const record = { evidenceId: 'ev1', description: 'Automated consensus' };
  await fs.mkdir(path.join(runDir, 'evidence'), { recursive: true });
  await fs.writeFile(path.join(runDir, 'evidence', 'evidence-records.jsonl'), JSON.stringify(record) + '\n');
  return { status: 'succeeded' };
};

export const calculateConfidence = async (runDir, context) => {
  const confidence = { score: 0.9, explanation: 'Strong consensus' };
  await fs.writeFile(path.join(runDir, 'confidence.json'), JSON.stringify(confidence, null, 2));
  return { status: 'succeeded' };
};

export const detectIssues = async (runDir, context) => {
  const issues = [];
  await fs.writeFile(path.join(runDir, 'issues.json'), JSON.stringify(issues, null, 2));
  return { status: 'succeeded' };
};

export const exportReviewPackage = async (runDir, context) => {
  const manifest = { packageId: 'pkg1', runId: context.runId };
  await fs.mkdir(path.join(runDir, 'exports'), { recursive: true });
  await fs.writeFile(path.join(runDir, 'exports', 'review-package-manifest.json'), JSON.stringify(manifest, null, 2));
  return { status: 'succeeded' };
};
