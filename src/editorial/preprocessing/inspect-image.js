import fs from 'node:fs/promises';
import path from 'node:path';

export const inspectImage = async (runDir, context) => {
  console.log(`Inspecting image for ${context.sourceId}, page ${context.page}`);
  
  // Placeholder: Record dummy dimensions
  const inspection = {
    width: 1000,
    height: 2000,
    method: 'placeholder',
    timestamp: new Date().toISOString()
  };
  
  const preprocessDir = path.join(runDir, 'preprocessing');
  await fs.mkdir(preprocessDir, { recursive: true });
  await fs.writeFile(path.join(preprocessDir, 'image-inspection.json'), JSON.stringify(inspection, null, 2));
  
  return { status: 'succeeded' };
};
