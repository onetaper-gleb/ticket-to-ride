// Own encoding pipeline for five built-in image_gen edits. No pixel grading.
// Public dependency: sharp0.35.5, Apache-2.0; provide it via ordinary Node resolution.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const names = ['wood-tile', 'stone-tile', 'plaster-tile', 'leather-tile', 'paper-tile'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
  const check = process.argv.includes('--check');
  const option = process.argv.find(value => value.startsWith('--input-dir='));
  if (!check && !option) throw new Error('Supply --input-dir with the five selected generated PNG masters');
  for (const name of names) {
    const saved = path.join(name === 'wood-tile' ? root : __dirname, name + '.png');
    if (!check) {
      const input = path.join(path.resolve(option.slice('--input-dir='.length)), name + '.png');
      await sharp(input).resize(512, 512, { fit: 'fill' }).removeAlpha().png().toFile(saved);
    }
    const bytes = await sharp(saved).removeAlpha().webp({ quality: 86, effort: 6 }).toBuffer();
    const target = path.join(root, name + '.webp');
    if (check) {
      if (hash(bytes) !== hash(await fs.readFile(target))) throw new Error('Encoding differs: ' + name);
    } else await fs.writeFile(target, bytes);
    console.log(name + ': ' + bytes.length + ' bytes; ' + hash(bytes));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
