import fs from 'node:fs/promises';
import path from 'node:path';

export const detectLines = async (runDir, context) => {
  console.log(`Detecting lines for ${context.sourceId}, page ${context.page}`);
  const lines = [{ lineId: 'l1', regionId: 'r1', column: 'c1', lineNumber: 1, boundingBox: [15,15,35,25], readingOrder: 1 }];
  await fs.writeFile(path.join(runDir, 'segmentation', 'lines.json'), JSON.stringify(lines, null, 2));
  return { status: 'succeeded' };
};
