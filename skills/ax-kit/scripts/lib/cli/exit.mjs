import { EXIT } from '../model.mjs';

const GATE_EXIT = { pass: EXIT.ok, fail: EXIT.gateFailed, inconclusive: EXIT.gateInconclusive };

export function exitCodeOf(report) {
  if (report.score === null) return EXIT.noScore;
  return report.gate ? GATE_EXIT[report.gate.outcome] : EXIT.ok;
}
