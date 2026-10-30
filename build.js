import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
for (const name of ['books.js', 'articles.js']) {
  const source = await readFile(new URL(`./${name}`, import.meta.url), 'utf8');
  new Script(source);
  await writeFile(new URL(`./dist/${name}`, import.meta.url), source);
}
const assets = new URL('./assets/', import.meta.url);
if (existsSync(assets)) await cp(assets, new URL('./dist/assets/', import.meta.url), { recursive: true });
for (const name of await readdir(new URL('./', import.meta.url))) {
  if (/\.(png|jpe?g|webp|avif)$/i.test(name)) await cp(new URL(`./${name}`, import.meta.url), new URL(`./dist/${name}`, import.meta.url));
}
