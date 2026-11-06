import { readFile, writeFile } from 'node:fs/promises';

const files = ['index.html', 'styles.css', 'app.js', 'pontos-mark.svg'];
const site = {};
for (const file of files) site[`/${file}`] = await readFile(new URL(file, import.meta.url), 'utf8');
await writeFile(new URL('site-files.js', import.meta.url), `export default ${JSON.stringify(site)};\n`);
