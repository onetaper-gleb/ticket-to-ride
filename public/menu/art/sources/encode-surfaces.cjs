// Encodes the saved 512x512 RGB masters. Image generation itself is documented
// in generated-surfaces-prompts.json and cannot be reproduced by this encoder.
// Public dependency: sharp 0.35.5, Apache-2.0.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const names = ['board-paint', 'wood-tile', 'paper-tile', 'leather-tile', 'plaster-tile', 'stone-tile'];
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
(async () => {
  for (const name of names) {
    const source = path.join(name === 'wood-tile' || name === 'board-paint' ? root : __dirname, name + '.png');
    const target = path.join(root, name + '.webp');
    const output = await sharp(source).removeAlpha().webp({ quality: 86, effort: 6 }).toBuffer();
    if (process.argv.includes('--check')) {
      if (digest(output) !== digest(await fs.readFile(target))) throw new Error('Encoding differs: ' + name);
    } else await fs.writeFile(target, output);
    console.log(name + ': ' + output.length + ' bytes');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
