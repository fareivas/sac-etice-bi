import { readFileSync, writeFileSync } from 'node:fs';

const [source, destination, functionName] = process.argv.slice(2);
if (!['FiscalFunction', 'GerenteContratosFunction'].includes(functionName)) {
  throw new Error('Função de debug inválida.');
}
const template = readFileSync(source, 'utf8');
const start = template.indexOf(`  ${functionName}:\n`);
if (start < 0) throw new Error('Função não encontrada no template SAM.');
const next = /\n  [A-Za-z][A-Za-z0-9]*:\n/g;
next.lastIndex = start + 3;
const end = next.exec(template)?.index ?? template.length;
const section = template.slice(start, end);
const marker = '        Format: cjs';
if (section.split(marker).length !== 2) throw new Error('BuildProperties inesperadas.');
const properties = '    Properties:\n      CodeUri:';
if (section.split(properties).length !== 2 || /^      MemorySize:/m.test(section)) {
  throw new Error('Propriedades da função inesperadas.');
}
const debugSection = section
  .replace(properties, '    Properties:\n      MemorySize: 512\n      CodeUri:')
  .replace(marker, `${marker}\n        Sourcemap: true\n        SourcesContent: true`);
writeFileSync(destination, template.slice(0, start) + debugSection + template.slice(end), { mode: 0o600, flag: 'wx' });
