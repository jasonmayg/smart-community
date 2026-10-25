// Organization and access control.
//
// Two trees share one permission model:
//   Platform → Group (a property company) → Property (a residential community) → Department → staff
//   Property → Household → members (household head, adults, older adults, children)
//
// Delegation rule: you can grant only roles below your own level, and only inside your own scope.
// A group admin creates property managers for the group's properties; a property manager creates
// department leads and staff in that property; a department lead adds staff to their department;
// a household head adds family members to their household.

export const GROUP = { id: 'g1', name: 'Harborview Living' };
export const PROPERTIES = [
  { id: 'p1', group: 'g1', name: 'Maple Court', households: 812, buildings: 6, live: true },
  { id: 'p2', group: 'g1', name: 'Cedar Point', households: 640, buildings: 4, kpi: { open: 23, overdue: 4, fees: 0.91, atRisk: 7, flags: 2 } },
  { id: 'p3', group: 'g1', name: 'Riverside Gardens', households: 1020, buildings: 9, kpi: { open: 41, overdue: 11, fees: 0.84, atRisk: 15, flags: 5 } },
];

export const DEPARTMENTS = {
  cs: { name: 'Customer service', staffTitle: 'Service agent', leadTitle: 'Service lead',
    staff: ['wo.view.all', 'wo.correct', 'wo.expedite', 'wo.create', 'care.view'], lead: ['wo.assign', 'care.manage'] },
  maintenance: { name: 'Maintenance', staffTitle: 'Technician', leadTitle: 'Maintenance lead',
    staff: ['wo.view.dept', 'wo.work', 'assets.view'], lead: ['wo.assign', 'wo.correct', 'wo.expedite', 'assets.plan'] },
  security: { name: 'Security', staffTitle: 'Security officer', leadTitle: 'Security lead',
    staff: ['wo.view.dept', 'wo.work'], lead: ['wo.assign', 'wo.correct', 'wo.expedite', 'assets.view'] },
  commercial: { name: 'Commercial', staffTitle: 'Commercial specialist', leadTitle: 'Commercial lead',
    staff: ['market.manage', 'canteen.manage'], lead: ['revenue.view'] },
  finance: { name: 'Finance', staffTitle: 'Finance clerk', leadTitle: 'Finance lead',
    staff: ['wo.view.dept', 'wo.work', 'fees.view'], lead: ['revenue.view', 'wo.assign'] },
};

const PROPERTY_ALL = ['resident.preview', 'wo.view.all', 'wo.assign', 'wo.correct', 'wo.expedite', 'wo.create', 'assets.view', 'assets.plan', 'care.view', 'care.manage',
  'canteen.manage', 'market.manage', 'fees.view', 'revenue.view', 'org.view', 'org.grant'];

/** Roles, highest first. `scope` is the kind of node the role is attached to. */
export const ROLES = {
  platform_admin: { label: 'Platform admin', level: 100, scope: 'platform', perms: [...PROPERTY_ALL, 'portfolio.view'] },
  group_admin: { label: 'Group admin', level: 80, scope: 'group', perms: [...PROPERTY_ALL, 'portfolio.view'] },
  property_manager: { label: 'Property manager', level: 60, scope: 'property', perms: PROPERTY_ALL },
  dept_lead: { label: 'Department lead', level: 40, scope: 'department', perms: ['org.view', 'org.grant'] },
  staff: { label: 'Staff', level: 20, scope: 'department', perms: [] },
  household_head: { label: 'Household head', level: 30, scope: 'household', perms: ['resident.app', 'pay', 'wo.create', 'wo.view.own', 'wo.expedite', 'wo.verify', 'household.manage', 'org.view', 'org.grant'] },
  adult: { label: 'Adult member', level: 10, scope: 'household', perms: ['resident.app', 'pay', 'wo.create', 'wo.view.own', 'wo.expedite', 'wo.verify'] },
  older_adult: { label: 'Older adult', level: 10, scope: 'household', perms: ['resident.app', 'pay', 'wo.create', 'wo.view.own', 'wo.expedite', 'wo.verify', 'care.enrolled'] },
  child: { label: 'Child', level: 5, scope: 'household', perms: ['resident.app', 'wo.view.own'] },
};
export const HOUSEHOLD_ROLES = ['household_head', 'adult', 'older_adult', 'child'];

export const HOUSEHOLDS = [
  { id: 'h1', property: 'p1', apt: 'C-302', name: 'Chen household' },
  { id: 'h2', property: 'p1', apt: 'B-204', name: 'Okafor household' },
];

/** Seed users. `scope` holds the node ids the role applies to. */
export const SEED_USERS = [
  { id: 'u0', name: 'Platform operations', role: 'platform_admin', scope: {} },
  { id: 'u1', name: 'Grace Liu', role: 'group_admin', scope: { group: 'g1' } },
  { id: 'u2', name: 'Dana Brooks', role: 'property_manager', scope: { group: 'g1', property: 'p1' } },
  { id: 'u3', name: 'Priya Nair', role: 'dept_lead', scope: { group: 'g1', property: 'p1', dept: 'cs' } },
  { id: 'u4', name: 'Mia Torres', role: 'staff', scope: { group: 'g1', property: 'p1', dept: 'cs' } },
  { id: 'u5', name: 'Marco Ruiz', role: 'dept_lead', scope: { group: 'g1', property: 'p1', dept: 'maintenance' } },
  { id: 'u6', name: 'Leo Chang', role: 'staff', scope: { group: 'g1', property: 'p1', dept: 'maintenance' } },
  { id: 'u7', name: 'Raj Patel', role: 'staff', scope: { group: 'g1', property: 'p1', dept: 'maintenance' } },
  { id: 'u8', name: 'Sam Okoye', role: 'dept_lead', scope: { group: 'g1', property: 'p1', dept: 'security' } },
  { id: 'u9', name: 'Ken Ito', role: 'staff', scope: { group: 'g1', property: 'p1', dept: 'security' } },
  { id: 'u10', name: 'Elena Park', role: 'dept_lead', scope: { group: 'g1', property: 'p1', dept: 'commercial' } },
  { id: 'u11', name: 'Tom Weber', role: 'dept_lead', scope: { group: 'g1', property: 'p1', dept: 'finance' } },
  { id: 'u12', name: 'Mrs. Chen', role: 'household_head', scope: { group: 'g1', property: 'p1', household: 'h1' }, age: 78 },
  { id: 'u13', name: 'Lily Chen', role: 'adult', scope: { group: 'g1', property: 'p1', household: 'h1' }, note: 'Daughter, lives across town; sees care alerts' },
  { id: 'u14', name: 'Daniel Okafor', role: 'household_head', scope: { group: 'g1', property: 'p1', household: 'h2' } },
  { id: 'u15', name: 'Ruth Okafor', role: 'adult', scope: { group: 'g1', property: 'p1', household: 'h2' } },
  { id: 'u16', name: 'Mrs. Okafor', role: 'older_adult', scope: { group: 'g1', property: 'p1', household: 'h2' }, age: 79 },
  { id: 'u17', name: 'Tobi Okafor', role: 'child', scope: { group: 'g1', property: 'p1', household: 'h2' }, age: 9, limits: { daily: 10 } },
];

export const roleLabel = u => (u.role === 'staff' ? DEPARTMENTS[u.scope.dept].staffTitle : u.role === 'dept_lead' ? DEPARTMENTS[u.scope.dept].leadTitle : ROLES[u.role].label);

/** All permissions a user holds. Department roles combine the role's own perms with the department's. */
export function permsOf(u) {
  const base = new Set(ROLES[u.role].perms);
  const d = DEPARTMENTS[u.scope?.dept];
  if (d && (u.role === 'staff' || u.role === 'dept_lead')) {
    d.staff.forEach(p => base.add(p));
    if (u.role === 'dept_lead') d.lead.forEach(p => base.add(p));
  }
  return base;
}
export const can = (u, perm) => permsOf(u).has(perm);

/** Does `outer` contain `inner`? Scopes are compared from the top of the tree down. */
export function contains(outer, inner) {
  for (const k of ['group', 'property', 'dept', 'household']) {
    if (outer[k] && outer[k] !== inner[k]) return false;
  }
  return true;
}

/** Can `actor` give `role` at `scope`? Returns { ok, reason }. */
export function checkGrant(actor, role, scope) {
  const R = ROLES[role], A = ROLES[actor.role];
  if (!R) return { ok: false, reason: 'Unknown role.' };
  if (!permsOf(actor).has('org.grant')) return { ok: false, reason: `${roleLabel(actor)} can’t grant access.` };
  if (R.level >= A.level) return { ok: false, reason: `You can only grant roles below your own (${A.label}).` };
  if (!contains(actor.scope, scope)) return { ok: false, reason: 'That is outside the part of the organization you manage.' };
  const need = { group: ['group'], property: ['group', 'property'], department: ['group', 'property', 'dept'], household: ['group', 'property', 'household'] }[R.scope] || [];
  const missing = need.filter(k => !scope[k]);
  if (missing.length) return { ok: false, reason: `${R.label} needs a ${missing.join(' and ')}.` };
  // Household roles are granted only inside a household, and staff roles never are.
  const isHousehold = HOUSEHOLD_ROLES.includes(role);
  if (actor.role === 'household_head' && !isHousehold) return { ok: false, reason: 'Household heads can only add family members.' };
  if (actor.role === 'dept_lead' && role !== 'staff') return { ok: false, reason: 'Department leads can only add staff to their department.' };
  if (isHousehold && role === 'household_head' && !['property_manager', 'group_admin', 'platform_admin'].includes(actor.role)) return { ok: false, reason: 'Only property management can register a household head.' };
  return { ok: true };
}

/** Roles this actor may grant at all (before picking a scope). */
export const grantableRoles = actor => Object.keys(ROLES).filter(r => {
  const probe = { ...actor.scope };
  if (ROLES[r].scope === 'group') probe.group ||= 'g1';
  if (['property', 'department', 'household'].includes(ROLES[r].scope)) { probe.group ||= 'g1'; probe.property ||= 'p1'; }
  if (ROLES[r].scope === 'department') probe.dept ||= 'cs';
  if (ROLES[r].scope === 'household') probe.household ||= 'h1';
  return checkGrant(actor, r, probe).ok;
});

/** Can `actor` remove `target`? Same rule as granting their role at their scope, and never yourself. */
export function checkRevoke(actor, target) {
  if (actor.id === target.id) return { ok: false, reason: 'You can’t remove your own access.' };
  return checkGrant(actor, target.role, target.scope);
}

/** Users visible to an actor: everyone inside their scope. */
export const visibleUsers = (actor, users) => users.filter(u => contains(actor.scope, u.scope));

/** Capability table for the permission matrix. */
export const CAPABILITIES = [
  ['portfolio.view', 'See all properties in the group'],
  ['org.grant', 'Grant and remove access below own level'],
  ['wo.view.all', 'See every work order in the property'],
  ['wo.view.dept', 'See own department’s work orders'],
  ['wo.view.own', 'See own household’s requests'],
  ['wo.assign', 'Assign and reassign work orders'],
  ['wo.work', 'Accept, start, hold and complete work'],
  ['wo.expedite', 'Expedite a request'],
  ['wo.correct', 'Correct category, department or asset'],
  ['wo.verify', 'Confirm a fix or reopen'],
  ['assets.view', 'See facility health'],
  ['assets.plan', 'Approve preventive replacements'],
  ['care.view', 'See the care watchlist'],
  ['revenue.view', 'See revenue'],
  ['pay', 'Pay bills and orders'],
  ['household.manage', 'Manage household members'],
];

/** Route-level access. A user sees a page if they hold any of its permissions. */
export const ROUTE_PERMS = {
  overview: [],
  resident: ['resident.app', 'resident.preview'],
  orders: ['wo.view.all', 'wo.view.dept'],
  evaluation: ['wo.view.all'],
  metrics: ['wo.view.all'],
  facilities: ['assets.view'],
  care: ['care.view'],
  canteen: ['canteen.manage'],
  market: ['market.manage'],
  revenue: ['revenue.view'],
  org: ['org.view'],
};
export const canSee = (u, route) => !ROUTE_PERMS[route]?.length || ROUTE_PERMS[route].some(p => can(u, p));
