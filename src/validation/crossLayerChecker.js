/**
 * Cross-Layer Consistency Checker
 *
 * Validates semantic consistency across all 5 schema layers.
 * Uses flexible matching so entities like "Task" match "tasks" in DB/API.
 */

export function checkCrossLayerConsistency(schemas, intent) {
  const issues = [];
  const intentEntities = intent?.entities || [];
  const intentRoles = intent?.userRoles || [];

  // 1. Every non-User entity must have a DB table
  if (intentEntities.length > 0 && schemas.db?.tables) {
    const tableNames = schemas.db.tables.map(t => t.name.toLowerCase());
    for (const entity of intentEntities) {
      if (entity === 'User') continue;
      const el = entity.toLowerCase();
      const found = tableNames.some(t => t.includes(el) || el.includes(t.replace(/s$/, '')));
      if (!found) {
        issues.push({ type: 'missing_table', severity: 'error', message: `Entity "${entity}" has no DB table`, layers: ['intent', 'db'] });
      }
    }
  }

  // 2. Every non-User entity must have API endpoints
  if (intentEntities.length > 0 && schemas.api?.endpoints) {
    const apiPaths = schemas.api.endpoints.map(e => e.path.toLowerCase());
    for (const entity of intentEntities) {
      if (entity === 'User') continue;
      const el = entity.toLowerCase();
      if (!apiPaths.some(p => p.includes(el))) {
        issues.push({ type: 'missing_api', severity: 'error', message: `Entity "${entity}" has no API endpoints`, layers: ['intent', 'api'] });
      }
    }
  }

  // 3. Every non-User entity should have a UI page (warning only)
  if (intentEntities.length > 0 && schemas.ui?.pages) {
    const pageNames = schemas.ui.pages.map(p => p.name.toLowerCase());
    const pageRoutes = schemas.ui.pages.map(p => p.route.toLowerCase());
    for (const entity of intentEntities) {
      if (entity === 'User') continue;
      const el = entity.toLowerCase();
      const hasPage = pageNames.some(n => n.includes(el)) || pageRoutes.some(r => r.includes(el));
      if (!hasPage) {
        issues.push({ type: 'missing_ui_page', severity: 'warning', message: `Entity "${entity}" has no UI page`, layers: ['intent', 'ui'] });
      }
    }
  }

  // 4. Auth roles must match intent roles
  if (intentRoles.length > 0 && schemas.auth?.roles) {
    const authRoleNames = schemas.auth.roles.map(r => r.name.toLowerCase());
    for (const role of intentRoles) {
      if (!authRoleNames.includes(role.toLowerCase())) {
        issues.push({ type: 'missing_auth_role', severity: 'error', message: `Role "${role}" missing from auth schema`, layers: ['intent', 'auth'] });
      }
    }
  }

  // 5. Protected routes must have valid roles
  if (schemas.api?.endpoints && schemas.auth?.protectedRoutes) {
    const allRoles = (schemas.auth.roles || []).map(r => r.name);
    const publicRoutes = schemas.auth.publicRoutes || [];
    for (const route of schemas.auth.protectedRoutes || []) {
      const invalidRoles = (route.roles || []).filter(r => !allRoles.includes(r));
      if (invalidRoles.length > 0) {
        issues.push({ type: 'invalid_role_reference', severity: 'error', message: `Route "${route.pattern}" references undefined roles: ${invalidRoles.join(', ')}`, layers: ['auth'] });
      }
    }
    // Check unprotected routes
    for (const endpoint of schemas.api.endpoints) {
      if (endpoint.auth === false) continue;
      const isPublic = publicRoutes.some(pr => endpoint.path.startsWith(pr));
      if (isPublic) continue;
      const isCovered = (schemas.auth.protectedRoutes || []).some(route => {
        const rx = new RegExp('^' + route.pattern.replace(/\*/g, '.*') + '$');
        return rx.test(endpoint.path);
      });
      if (!isCovered) {
        issues.push({ type: 'unprotected_route', severity: 'warning', message: `Route "${endpoint.method} ${endpoint.path}" not covered by auth`, layers: ['api', 'auth'] });
      }
    }
  }

  // 6. DB tables should have API endpoints
  if (schemas.db?.tables && schemas.api?.endpoints) {
    for (const table of schemas.db.tables) {
      if (table.name === 'users') continue;
      const apiPaths = schemas.api.endpoints.map(e => e.path.toLowerCase());
      const baseName = table.name.replace(/s$/, '');
      if (!apiPaths.some(p => p.includes(table.name) || p.includes(baseName))) {
        issues.push({ type: 'orphan_table', severity: 'warning', message: `DB table "${table.name}" has no API endpoints`, layers: ['db', 'api'] });
      }
    }
  }

  // 7. Logic rules must use valid triggers
  if (schemas.logic?.rules) {
    const validTriggers = ['api_request', 'data_mutation', 'feature_access', 'subscription_change', 'user_action', 'system_event'];
    for (const rule of schemas.logic.rules) {
      if (!validTriggers.includes(rule.trigger)) {
        issues.push({ type: 'invalid_trigger', severity: 'warning', message: `Rule "${rule.name}" uses unknown trigger "${rule.trigger}"`, layers: ['logic'] });
      }
    }
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const score = Math.max(0, 1 - (errorCount * 0.2) - (warningCount * 0.05));

  return {
    isConsistent: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    score: Math.round(score * 100) / 100,
  };
}
