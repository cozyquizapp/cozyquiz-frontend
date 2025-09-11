import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd(), 'public', 'funfacts');
const TARGETS = ['kaffee.png'];

async function ensureOptimized(srcName){
  const srcPath = path.join(ROOT, srcName);
  if(!fs.existsSync(srcPath)){
    console.error('Source not found:', srcPath);
    return;
  }
  const base = srcName.replace(/\.png$/i,'');
  const webpPath = path.join(ROOT, base + '.webp');
  const avifPath = path.join(ROOT, base + '.avif');
  try {
    const input = sharp(srcPath);
    const meta = await input.metadata();
    // Resize if absurdly large (cap longest edge to 1600px for quiz overlay use)
    const MAX = 1600;
    const resizeNeeded = meta.width && meta.height && (meta.width > MAX || meta.height > MAX);
    const basePipeline = resizeNeeded ? input.resize({ width: meta.width > meta.height ? MAX : undefined, height: meta.height >= meta.width ? MAX : undefined, withoutEnlargement: true }) : input.clone();

    if(!fs.existsSync(webpPath)){
      await basePipeline.clone().webp({ quality: 72 }).toFile(webpPath);
      console.log('Created', path.relative(process.cwd(), webpPath));
    }
    if(!fs.existsSync(avifPath)){
      await basePipeline.clone().avif({ quality: 55 }).toFile(avifPath);
      console.log('Created', path.relative(process.cwd(), avifPath));
    }
  } catch(e){
    console.error('Optimization failed for', srcName, e);
  }
}

(async () => {
  for(const t of TARGETS){
    await ensureOptimized(t);
  }
})();
