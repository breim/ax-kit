#!/usr/bin/env node
import { parseArgs, UsageError, USAGE } from './lib/cli/args.mjs';
import { exitCodeOf } from './lib/cli/exit.mjs';
import { catalogData, renderCatalog } from './lib/docs/catalog.mjs';
import { EXIT, SCANNER_VERSION } from './lib/model.mjs';
import { CHECKS, GROUPS } from './lib/registry.mjs';
import { renderText } from './lib/report/text.mjs';
import { scan } from './lib/scan/scan.mjs';

const print = (text) => process.stdout.write(`${text}\n`);

async function runScan(args) {
  const report = await scan(args);
  print(args.json ? JSON.stringify(report, null, 2) : renderText(report));
  return exitCodeOf(report);
}

function runCatalog(args) {
  const output = args.format === 'json' ? JSON.stringify(catalogData(CHECKS, GROUPS), null, 2) : renderCatalog(CHECKS, GROUPS);
  process.stdout.write(args.format === 'json' ? `${output}\n` : output);
  return EXIT.ok;
}

const COMMANDS = {
  scan: runScan,
  catalog: runCatalog,
  help: () => (print(USAGE), EXIT.ok),
  version: () => (print(SCANNER_VERSION), EXIT.ok),
};

async function main(argv) {
  try {
    const args = parseArgs(argv);
    return await COMMANDS[args.command](args);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n\n${USAGE}\n`);
      return EXIT.usage;
    }
    process.stderr.write(`Internal error: ${error?.stack ?? error}\n`);
    return EXIT.internal;
  }
}

process.exitCode = await main(process.argv.slice(2));
