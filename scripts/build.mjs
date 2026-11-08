import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
let page = await read('index.html');

// Inline the same assets used by the development page for the portable download.
for (const match of page.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const source = (await read(match[1])).replace(/<\/script/gi, '<\\/script');
  page = page.replace(match[0], () => '<script>' + source + '</script>');
}
const css = await read('src/style.css');
page = page.replace('<link rel="stylesheet" href="src/style.css">', () => '<style>' + css + '</style>');
const licenses = await read('THIRD-PARTY-LICENSES.txt');
page = page.replace('</html>', () => '<script type="text/plain" id="library-licenses">' + licenses + '</script>\n</html>');
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/gptchat-to-obsidian.html', root), page);
console.log('Created dist/gptchat-to-obsidian.html');
