import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
const logo = await readFile(new URL('./insta.svg', import.meta.url));
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error('Storefront script missing');
new Script(script);
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await writeFile(new URL('./dist/index.html', import.meta.url), html);
await writeFile(new URL('./dist/styles.css', import.meta.url), css);
await writeFile(new URL('./dist/insta.svg', import.meta.url), logo);
