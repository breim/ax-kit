import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '../skills/ax-kit/scripts');
const IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm;
const FORBIDDEN = [/\bchild_process\b/, /\beval\s*\(/, /\bnew Function\b/, /\bprocess\.env\b/];

const filesIn = (directory) =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesIn(path) : path.endsWith('.mjs') ? [path] : [];
  });

const FILES = filesIn(SCRIPTS);
const SOURCES = new Map(FILES.map((file) => [file, readFileSync(file, 'utf8')]));

const localImportsOf = (file) =>
  [...SOURCES.get(file).matchAll(IMPORT)].map((match) => match[1]).filter((target) => target.startsWith('.')).map((target) => resolve(dirname(file), target));

function findCycle(file, trail = []) {
  if (trail.includes(file)) return [...trail.slice(trail.indexOf(file)), file];
  for (const target of localImportsOf(file)) {
    const cycle = findCycle(target, [...trail, file]);
    if (cycle) return cycle;
  }
  return null;
}

test('each local import points to a file that exists', () => {
  for (const file of FILES) {
    for (const target of localImportsOf(file)) assert.ok(SOURCES.has(target), `${file} imports a missing file: ${target}`);
  }
});

test('the scanner modules have no import cycle', () => {
  for (const file of FILES) assert.equal(findCycle(file), null, `import cycle from ${file}`);
});

test('the scoring modules import only the model', () => {
  for (const file of FILES.filter((path) => path.includes('/lib/scoring/'))) {
    const outside = localImportsOf(file).filter((target) => !target.includes('/lib/scoring/') && !target.endsWith('/lib/model.mjs'));
    assert.deepEqual(outside, [], file);
  }
});

test('the scanner uses only Node built-in modules', () => {
  for (const file of FILES) {
    const external = [...SOURCES.get(file).matchAll(IMPORT)].map((match) => match[1]).filter((target) => !target.startsWith('.') && !target.startsWith('node:'));
    assert.deepEqual(external, [], file);
  }
});

test('the scanner has no process spawn, no dynamic code, and no environment access', () => {
  for (const [file, source] of SOURCES) {
    for (const pattern of FORBIDDEN) assert.equal(pattern.test(source), false, `${file} matches ${pattern}`);
  }
});
