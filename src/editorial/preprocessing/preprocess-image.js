import fs from 'node:fs/promises';
import path from 'node:path';

export const preprocessImage = async (runDir, context) => {
  console.log(`Preprocessing image for ${context.sourceId}, page ${context.page}`);
  
  // Placeholder: Record manifest
  const manifest = {
    operation: 'no-op',
    method: 'placeholder',
    timestamp: new Date().toISOString()
  };
  
  const preprocessDir = path.join(runDir, 'preprocessing');
  await fs.writeFile(path.join(preprocessDir, 'preprocessing-manifest.json'), JSON.stringify(manifest, null, 2));
  
  return { status: 'succeeded' };
};
