import * as act from './checks/act.mjs';
import * as authorize from './checks/authorize.mjs';
import * as discover from './checks/discover.mjs';
import * as reach from './checks/reach.mjs';
import * as read from './checks/read.mjs';
import * as recover from './checks/recover.mjs';
import * as transact from './checks/transact.mjs';

const PILLAR_MODULES = [reach, discover, read, act, authorize, recover, transact];

export const GROUPS = PILLAR_MODULES.flatMap((module) => module.groups);

const groupById = new Map(GROUPS.map((group) => [group.id, group]));

const inheritFromGroup = (check) => {
  const group = groupById.get(check.group);
  return group ? { ...check, tier: group.tier, profiles: group.profiles, why: group.why, playbook: group.playbook } : check;
};

export const CHECKS = PILLAR_MODULES.flatMap((module) => module.checks).map(inheritFromGroup);
