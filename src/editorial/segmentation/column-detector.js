import fs from 'node:fs/promises';
import path from 'node:path';

export const detectColumns = async (runDir, context) => {
  console.log(`Detecting columns for ${context.sourceId}, page ${context.page}`);
  const columns = [{ columnId: 'c1', regionId: 'r1', boundingBox: [10,10,40,190] }];
  await fs.writeFile(path.join(runDir, 'segmentation', 'columns.json'), JSON.stringify(columns, null, 2));
  return { status: 'succeeded' };
};
