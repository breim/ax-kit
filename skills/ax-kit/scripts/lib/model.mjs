export const SCANNER_VERSION = '0.1.0';
export const REGISTRY_VERSION = '1';
export const OUTPUT_SCHEMA = 'ax.scan/1';
export const USER_AGENT = `ax-kit/${SCANNER_VERSION}`;

export const PROFILES = ['content', 'api', 'webapp', 'commerce'];
export const PILLARS = ['reach', 'discover', 'read', 'act', 'authorize', 'recover', 'transact'];

export const ALL_PROFILES = PROFILES;
export const PAGE_PROFILES = ['content', 'webapp', 'commerce'];
export const API_PROFILES = ['api', 'webapp'];

export const TIER_WEIGHT = { essential: 4, recommended: 2, optional: 1 };

export const PILLAR_WEIGHT = {
  content: { reach: 20, discover: 30, read: 40, act: 0, authorize: 0, recover: 10, transact: 0 },
  api: { reach: 5, discover: 20, read: 0, act: 35, authorize: 25, recover: 15, transact: 0 },
  webapp: { reach: 15, discover: 20, read: 25, act: 15, authorize: 15, recover: 10, transact: 0 },
  commerce: { reach: 15, discover: 25, read: 45, act: 0, authorize: 0, recover: 15, transact: 0 },
};

export const GATE_CAP = 59;
export const MAX_UNIT_POINTS = 12;

export const GRADE_BANDS = [
  { min: 90, grade: 'A' },
  { min: 80, grade: 'B' },
  { min: 70, grade: 'C' },
  { min: 60, grade: 'D' },
  { min: 0, grade: 'F' },
];

// Credit is stored doubled so that partial credit (0.5) stays an integer.
export const FULL_CREDIT = 2;
export const CREDIT_BOUNDS = {
  pass: [2, 2],
  partial: [1, 1],
  fail: [0, 0],
  not_assessed: [0, 2],
};

export const LIMITS = {
  requests: 80,
  posts: 1,
  concurrency: 2,
  timeoutMs: 8000,
  bodyBytes: 2 * 1024 * 1024,
  redirects: 5,
  deadlineMs: 90000,
};

export const EXIT = {
  ok: 0,
  gateFailed: 1,
  usage: 2,
  gateInconclusive: 3,
  noScore: 4,
  internal: 5,
};

export const pillarOf = (id) => id.split('.')[0];
