import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { catalogData, renderCatalog } from '../skills/ax-kit/scripts/lib/docs/catalog.mjs';
import { CHECKS, GROUPS } from '../skills/ax-kit/scripts/lib/registry.mjs';

const CATALOG = new URL('../skills/ax-kit/references/checks.md', import.meta.url);

test('checks.md is the catalog that the registry generates', () => {
  assert.equal(readFileSync(CATALOG, 'utf8'), renderCatalog(CHECKS, GROUPS), 'Run `npm run catalog` to update checks.md.');
});

test('the catalog names each check one time', () => {
  const catalog = renderCatalog(CHECKS, GROUPS);
  for (const check of CHECKS) assert.equal(catalog.split(`\`${check.id}\``).length - 1, 1, check.id);
});

test('the JSON catalog has each check with its bucket and no function', () => {
  const data = catalogData(CHECKS, GROUPS);
  assert.equal(data.checks.length, CHECKS.length);
  for (const check of data.checks) {
    assert.ok(['score', 'review', 'watch'].includes(check.bucket), check.id);
    assert.equal(check.run, undefined, check.id);
  }
  assert.doesNotThrow(() => JSON.stringify(data));
});
