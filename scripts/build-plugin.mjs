import {build} from 'esbuild';
import {copyFile, mkdir, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
const versions = JSON.parse(await read('versions.json'));
if (manifest.version !== JSON.parse(await read('package.json')).version ||
    versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error('package.json, manifest.json and versions.json must agree.');
}
const output = new URL('dist/' + manifest.id + '/', root);
await mkdir(output, {recursive: true});
const thirdParty = await read('THIRD-PARTY-LICENSES.txt');
const markdownLicense = thirdParty.split(/\n(?=markdown-it )/).at(-1);
await build({
  entryPoints: [fileURLToPath(new URL('src/plugin.js', root))],
  outfile: fileURLToPath(new URL('main.js', output)),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2021',
  external: ['obsidian'],
  banner: {js: '/*\n' + await read('LICENSE') + '\n' + markdownLicense + '\n*/'},
});
await copyFile(new URL('manifest.json', root), new URL('manifest.json', output));
console.log('Created dist/' + manifest.id + '/');
