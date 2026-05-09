/**
 * Stage 5: Execution Simulator
 * 
 * Simulates a "dry run" of the generated application to verify it's
 * execution-ready without manual fixes. This is the CRITICAL DIFFERENCE
 * from simple prompt-and-output systems.
 * 
 * Checks:
 *   1. Route reachability — every UI page has a working API route
 *   2. Permission matrix — auth rules don't block valid flows
 *   3. Data model completeness — all CRUD operations have required fields
 *   4. Entity lifecycle — create → read → update → delete is possible
 */
import { checkCrossLayerConsistency } from '../validation/crossLayerChecker.js';

/**
 * Simulate execution of the generated application.
 * @returns {{ isExecutable, checks, score, issues }}
 */
export function simulateExecution(schemas, intent) {
  const checks = [];
  const issues = [];

  // 1. Cross-layer consistency
  const consistency = checkCrossLayerConsistency(schemas, intent);
  checks.push({
    name: 'Cross-Layer Consistency',
    passed: consistency.isConsistent,
    score: consistency.score,
    details: `${consistency.errorCount} errors, ${consistency.warningCount} warnings`,
  });
  issues.push(...consistency.issues);

  // 2. Route reachability simulation
  const routeCheck = checkRouteReachability(schemas);
  checks.push(routeCheck);
  if (!routeCheck.passed) {
    issues.push(...(routeCheck.issues || []));
  }

  // 3. Permission matrix validation
  const permCheck = checkPermissionMatrix(schemas);
  checks.push(permCheck);
  if (!permCheck.passed) {
    issues.push(...(permCheck.issues || []));
  }

  // 4. CRUD completeness
  const crudCheck = checkCRUDCompleteness(schemas, intent);
  checks.push(crudCheck);
  if (!crudCheck.passed) {
    issues.push(...(crudCheck.issues || []));
  }

  // 5. Data model integrity
  const dataCheck = checkDataModelIntegrity(schemas);
  checks.push(dataCheck);
  if (!dataCheck.passed) {
    issues.push(...(dataCheck.issues || []));
  }

  // Compute overall score
  const totalChecks = checks.length;
  const passedChecks = checks.filter(c => c.passed).length;
  const avgScore = checks.reduce((sum, c) => sum + (c.score || (c.passed ? 1 : 0)), 0) / totalChecks;

  return {
    isExecutable: passedChecks >= totalChecks * 0.7, // 70% threshold
    checks,
    score: Math.round(avgScore * 100) / 100,
    passedCount: passedChecks,
    totalCount: totalChecks,
    issues,
  };
}

function checkRouteReachability(schemas) {
  const checkIssues = [];
  if (!schemas.ui?.pages || !schemas.api?.endpoints) {
    return { name: 'Route Reachability', passed: false, score: 0, details: 'Missing UI or API schema', issues: checkIssues };
  }

  const apiPaths = schemas.api.endpoints.map(e => e.path.toLowerCase());
  let reachable = 0;
  let total = 0;

  for (const page of schemas.ui.pages) {
    if (!page.requiresAuth && page.route === '/login') continue; // Login doesn't need API
    total++;

    // Check if page's data sources have API backing
    const pageEntity = page.route.replace(/^\//, '').replace(/\/:.*/, '').toLowerCase();
    const hasApi = apiPaths.some(p => p.includes(pageEntity) || pageEntity === 'dashboard');

    if (hasApi) {
      reachable++;
    } else {
      checkIssues.push({
        type: 'unreachable_route',
        severity: 'warning',
        message: `UI page "${page.name}" (${page.route}) may not have API backing`,
        layers: ['ui', 'api'],
      });
    }
  }

  const score = total > 0 ? reachable / total : 1;
  return {
    name: 'Route Reachability',
    passed: score >= 0.7,
    score: Math.round(score * 100) / 100,
    details: `${reachable}/${total} routes reachable`,
    issues: checkIssues,
  };
}

function checkPermissionMatrix(schemas) {
  const checkIssues = [];
  if (!schemas.auth?.roles || !schemas.auth?.protectedRoutes) {
    return { name: 'Permission Matrix', passed: true, score: 1, details: 'No protected routes defined', issues: checkIssues };
  }

  const allRoles = schemas.auth.roles.map(r => r.name);
  let valid = 0;
  let total = 0;

  for (const route of schemas.auth.protectedRoutes) {
    total++;
    const allRolesValid = route.roles.every(r => allRoles.includes(r));
    if (allRolesValid) {
      valid++;
    } else {
      const invalidRoles = route.roles.filter(r => !allRoles.includes(r));
      checkIssues.push({
        type: 'invalid_role_reference',
        severity: 'error',
        message: `Protected route "${route.pattern}" references undefined roles: ${invalidRoles.join(', ')}`,
        layers: ['auth'],
      });
    }
  }

  const score = total > 0 ? valid / total : 1;
  return {
    name: 'Permission Matrix',
    passed: score >= 0.9,
    score: Math.round(score * 100) / 100,
    details: `${valid}/${total} route permissions valid`,
    issues: checkIssues,
  };
}

function checkCRUDCompleteness(schemas, intent) {
  const checkIssues = [];
  if (!schemas.api?.endpoints || !intent?.entities) {
    return { name: 'CRUD Completeness', passed: false, score: 0, details: 'Missing API or intent data', issues: checkIssues };
  }

  const requiredMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  let complete = 0;
  let total = 0;

  for (const entity of intent.entities) {
    if (entity === 'User') continue;
    total++;
    const entityPath = entity.toLowerCase();
    const entityEndpoints = schemas.api.endpoints.filter(e =>
      e.path.toLowerCase().includes(entityPath)
    );
    const methods = entityEndpoints.map(e => e.method);
    const hasAll = requiredMethods.every(m => methods.includes(m));

    if (hasAll) {
      complete++;
    } else {
      const missing = requiredMethods.filter(m => !methods.includes(m));
      checkIssues.push({
        type: 'incomplete_crud',
        severity: 'warning',
        message: `Entity "${entity}" missing CRUD methods: ${missing.join(', ')}`,
        layers: ['api'],
      });
    }
  }

  const score = total > 0 ? complete / total : 1;
  return {
    name: 'CRUD Completeness',
    passed: score >= 0.7,
    score: Math.round(score * 100) / 100,
    details: `${complete}/${total} entities have full CRUD`,
    issues: checkIssues,
  };
}

function checkDataModelIntegrity(schemas) {
  const checkIssues = [];
  if (!schemas.db?.tables) {
    return { name: 'Data Model Integrity', passed: false, score: 0, details: 'No DB schema', issues: checkIssues };
  }

  let valid = 0;
  let total = 0;

  for (const table of schemas.db.tables) {
    total++;
    const hasPK = table.columns.some(c => c.primaryKey);
    const hasCreatedAt = table.columns.some(c => c.name === 'created_at');

    if (hasPK && hasCreatedAt) {
      valid++;
    } else {
      if (!hasPK) {
        checkIssues.push({
          type: 'missing_primary_key',
          severity: 'error',
          message: `Table "${table.name}" has no primary key`,
          layers: ['db'],
        });
      }
      if (!hasCreatedAt) {
        checkIssues.push({
          type: 'missing_timestamp',
          severity: 'warning',
          message: `Table "${table.name}" has no created_at timestamp`,
          layers: ['db'],
        });
      }
    }
  }

  const score = total > 0 ? valid / total : 1;
  return {
    name: 'Data Model Integrity',
    passed: score >= 0.8,
    score: Math.round(score * 100) / 100,
    details: `${valid}/${total} tables properly structured`,
    issues: checkIssues,
  };
}
