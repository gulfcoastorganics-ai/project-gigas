import fs from 'node:fs/promises';
import path from 'node:path';

export const detectRegions = async (runDir, context) => {
  console.log(`Detecting regions for ${context.sourceId}, page ${context.page}`);
  
  const regions = [{ regionId: 'r1', type: 'textBlock', boundingBox: [0,0,100,200] }];
  
  const segDir = path.join(runDir, 'segmentation');
  await fs.mkdir(segDir, { recursive: true });
  await fs.writeFile(path.join(segDir, 'regions.json'), JSON.stringify(regions, null, 2));
  
  return { status: 'succeeded' };
};
