import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SCANNER_VERSION } from '../skills/ax-kit/scripts/lib/model.mjs';
import { CHECKS, GROUPS } from '../skills/ax-kit/scripts/lib/registry.mjs';

const SKILL_DIR = fileURLToPath(new URL('../skills/ax-kit/', import.meta.url));
const SKILL = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
const SPEC_FIELDS = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LOCAL_LINK = /\]\((?!https?:|#|mailto:)([^)\s]+)\)/g;

function parseFrontmatter(source) {
  const [, block] = /^---\n([\s\S]*?)\n---\n/.exec(source);
  const fields = {};
  let parent = null;
  for (const line of block.split('\n')) {
    const [, indent, key, value] = /^(\s*)([\w-]+):\s*(.*)$/.exec(line);
    if (indent) fields[parent][key] = value.replace(/^"(.*)"$/, '$1');
    else {
      fields[key] = value === '' ? {} : value;
      parent = key;
    }
  }
  return fields;
}

const frontmatter = parseFrontmatter(SKILL);
const body = SKILL.replace(/^---\n[\s\S]*?\n---\n/, '');
const references = readdirSync(join(SKILL_DIR, 'references')).filter((file) => file.endsWith('.md'));
const withoutCode = (source) => source.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
const linksOf = (source) => [...withoutCode(source).matchAll(LOCAL_LINK)].map((match) => match[1].split('#')[0]);

test('the frontmatter has only the fields of the Agent Skills specification', () => {
  assert.deepEqual(Object.keys(frontmatter).filter((field) => !SPEC_FIELDS.includes(field)), []);
});

test('the name obeys the specification and matches the directory', () => {
  assert.match(frontmatter.name, NAME);
  assert.ok(frontmatter.name.length <= 64);
  assert.equal(frontmatter.name, basename(SKILL_DIR));
});

test('the description and the compatibility text are within the limits', () => {
  assert.ok(frontmatter.description.length > 0 && frontmatter.description.length <= 1024, `${frontmatter.description.length} characters`);
  assert.ok(frontmatter.compatibility.length <= 500);
});

test('the metadata values are strings, and the version matches the scanner', () => {
  for (const value of Object.values(frontmatter.metadata)) assert.equal(typeof value, 'string');
  assert.equal(frontmatter.metadata.version, SCANNER_VERSION);
});

test('the body is within the size guidance of the specification', () => {
  assert.ok(body.split('\n').length < 500, `${body.split('\n').length} lines`);
});

test('each local link in SKILL.md and in the references points to a file', () => {
  for (const target of linksOf(SKILL)) assert.ok(existsSync(join(SKILL_DIR, target)), `SKILL.md links to ${target}`);
  for (const file of references) {
    const source = readFileSync(join(SKILL_DIR, 'references', file), 'utf8');
    for (const target of linksOf(source)) assert.ok(existsSync(join(SKILL_DIR, 'references', target)), `${file} links to ${target}`);
  }
});

test('each playbook of the registry exists as a reference file', () => {
  for (const record of [...CHECKS, ...GROUPS]) assert.ok(references.includes(`${record.playbook}.md`), `${record.id} names ${record.playbook}`);
});

test('each template that a reference names exists in assets', () => {
  for (const file of references) {
    const source = readFileSync(join(SKILL_DIR, 'references', file), 'utf8');
    for (const [, asset] of source.matchAll(/assets\/([\w.-]+\.\w+)/g)) assert.ok(existsSync(join(SKILL_DIR, 'assets', asset)), `${file} names assets/${asset}`);
  }
});

test('the skill is in a directory that the skills CLI discovers', () => {
  assert.equal(basename(dirname(SKILL_DIR.replace(/\/$/, ''))), 'skills');
});
