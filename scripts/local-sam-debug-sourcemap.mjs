import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const [artifactDir, repositoryRoot] = process.argv.slice(2);
const mapPath = resolve(artifactDir, 'handler.js.map');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
if (map.sourceRoot) throw new Error('sourceRoot inesperado no mapa SAM.');
const marker = '/services/api/src/';
let rewritten = 0;
map.sources = map.sources.map(source => {
  const index = source.lastIndexOf(marker);
  if (index < 0) return source;
  const original = join(resolve(repositoryRoot), source.slice(index + 1));
  if (!existsSync(original)) throw new Error(`Fonte TypeScript ausente: ${source.slice(index + 1)}`);
  rewritten++;
  return relative(dirname(mapPath), original).replaceAll('\\', '/');
});
if (!rewritten || !map.sources.some(source => source.endsWith('/handler.ts'))) {
  throw new Error('Mapa SAM sem fontes TypeScript do handler.');
}
writeFileSync(mapPath, JSON.stringify(map));
