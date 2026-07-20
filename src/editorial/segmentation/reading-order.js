import fs from 'node:fs/promises';
import path from 'node:path';

export const determineReadingOrder = async (runDir, context) => {
  console.log(`Determining reading order for ${context.sourceId}, page ${context.page}`);
  const readingOrder = [{ lineId: 'l1', order: 1 }];
  await fs.writeFile(path.join(runDir, 'segmentation', 'reading-order.json'), JSON.stringify(readingOrder, null, 2));
  return { status: 'succeeded' };
};
