// Four own built-in image_gen material edits; no pixel grading.
// Public dependency: Sharp 0.35.5, Apache-2.0, supplied by ordinary Node resolution.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const names = ['wood-tile', 'plaster-tile', 'stone-tile', 'paper-tile'];
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
  const check = process.argv.includes('--check');
  const argument = process.argv.find(value => value.startsWith('--input-dir='));
  if (!check && !argument) throw new Error('Supply --input-dir with four selected generated PNGs');
  for (const name of names) {
    const master = path.join(name === 'wood-tile' ? root : __dirname, name + '.png');
    if (!check) {
      const input = path.join(path.resolve(argument.slice('--input-dir='.length)), name + '.png');
      await sharp(input).resize(512, 512, {fit:'fill'}).removeAlpha().png().toFile(master);
    }
    const data = await sharp(master).removeAlpha().webp({quality:86, effort:6}).toBuffer();
    const runtime = path.join(root, name + '.webp');
    if (check) {
      if (sha(data) !== sha(await fs.readFile(runtime))) throw new Error('Encoding differs: ' + name);
    } else await fs.writeFile(runtime, data);
    console.log(name + ': ' + data.length + ' B, SHA256 ' + sha(data));
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
