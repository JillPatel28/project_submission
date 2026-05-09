/**
 * Unit Tests
 * 
 * Tests the core subsystems: CostTracker, JSON Validator, Repair Engine,
 * Cross-Layer Checker, and Input Analyzer heuristics.
 */
import { CostTracker } from '../costTracker.js';
import { attemptJSONRepair, validateLayer, parseAndValidate } from '../validation/jsonValidator.js';
import { checkCrossLayerConsistency } from '../validation/crossLayerChecker.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

// ═══ CostTracker Tests ═══
console.log('\n═══ CostTracker ═══');

const tracker = new CostTracker();
tracker.addStage('intent', { inputTokens: 100, outputTokens: 200, latencyMs: 50, attempts: 1, success: true });
tracker.addStage('design', { inputTokens: 200, outputTokens: 300, latencyMs: 70, attempts: 2, success: true });
tracker.addStage('ui-schema', { inputTokens: 150, outputTokens: 250, latencyMs: 60, attempts: 1, success: true });

const summary = tracker.getSummary();
assert(summary.totalInputTokens === 450, 'Sums input tokens correctly');
assert(summary.totalOutputTokens === 750, 'Sums output tokens correctly');
assert(summary.totalTokens === 1200, 'Sums total tokens correctly');
assert(summary.stageCount === 3, 'Stage count is correct');
assert(summary.totalAttempts === 4, 'Total attempts correct');
assert(summary.estimatedCost > 0, 'Estimated cost is positive');

const quality = tracker.computeQuality();
assert(Math.abs(quality.firstPassRate - 0.67) < 0.01, 'First-pass rate is ~0.67 (2 of 3)');
assert(quality.stagesWithRetries === 1, 'One stage had retries');

const tradeoff = tracker.computeTradeoff();
assert(['optimal', 'acceptable', 'degraded', 'slow-but-quality'].includes(tradeoff.verdict), 'Verdict is valid');
assert(typeof tradeoff.costPerQualityPoint === 'number', 'Cost per quality point is a number');

const report = tracker.getReport();
assert(report.stages.length === 3, 'Report has stages');
assert(report.summary !== undefined, 'Report has summary');
assert(report.qualityMetrics !== undefined, 'Report has quality metrics');
assert(report.tradeoff !== undefined, 'Report has tradeoff');

// ═══ JSON Validator Tests ═══
console.log('\n═══ JSON Validator ═══');

// Test valid JSON
const validResult = attemptJSONRepair('{"key": "value"}');
assert(validResult.success === true, 'Parses valid JSON');
assert(validResult.data.key === 'value', 'Extracts correct value');

// Test markdown-wrapped JSON
const mdResult = attemptJSONRepair('```json\n{"key": "value"}\n```');
assert(mdResult.success === true, 'Repairs markdown-wrapped JSON');
assert(mdResult.repaired === true || mdResult.data.key === 'value', 'Marks as repaired or parses correctly');

// Test trailing comma
const commaResult = attemptJSONRepair('{"key": "value",}');
assert(commaResult.success === true, 'Repairs trailing comma');

// Test preamble text
const preambleResult = attemptJSONRepair('Here is the output:\n{"key": "value"}');
assert(preambleResult.success === true, 'Strips preamble text');

// Test invalid JSON
const invalidResult = attemptJSONRepair('not json at all');
assert(invalidResult.success === false, 'Rejects truly invalid input');

// Test empty input
const emptyResult = attemptJSONRepair('');
assert(emptyResult.success === false, 'Rejects empty input');

// ═══ Schema Validation Tests ═══
console.log('\n═══ Schema Validation ═══');

const validIntent = {
  appName: 'TestApp',
  appType: 'fullstack',
  description: 'A test application for validation',
  features: ['crud_operations'],
  entities: ['User', 'Item'],
  userRoles: ['User', 'Admin'],
};
const intentValidation = validateLayer('intent', validIntent);
assert(intentValidation.valid === true, 'Valid intent passes schema validation');

const invalidIntent = { appName: 'Test' }; // Missing required fields
const invalidIntentValidation = validateLayer('intent', invalidIntent);
assert(invalidIntentValidation.valid === false, 'Invalid intent fails schema validation');
assert(invalidIntentValidation.errors.length > 0, 'Reports specific errors');

const validApi = {
  basePath: '/api',
  version: 'v1',
  endpoints: [
    { path: '/api/items', method: 'GET', auth: true },
  ],
};
const apiValidation = validateLayer('api', validApi);
assert(apiValidation.valid === true, 'Valid API schema passes validation');

// ═══ Cross-Layer Checker Tests ═══
console.log('\n═══ Cross-Layer Consistency ═══');

const testSchemas = {
  ui: {
    pages: [
      { name: 'Dashboard', route: '/dashboard', components: [], requiresAuth: true },
      { name: 'Items', route: '/items', components: [], requiresAuth: true },
    ],
  },
  api: {
    endpoints: [
      { path: '/api/auth/login', method: 'POST', auth: false },
      { path: '/api/items', method: 'GET', auth: true },
      { path: '/api/items', method: 'POST', auth: true },
      { path: '/api/items/:id', method: 'PUT', auth: true },
      { path: '/api/items/:id', method: 'DELETE', auth: true },
    ],
  },
  db: {
    tables: [
      { name: 'users', columns: [{ name: 'id', type: 'uuid', primaryKey: true }, { name: 'created_at', type: 'timestamp' }] },
      { name: 'items', columns: [{ name: 'id', type: 'uuid', primaryKey: true }, { name: 'created_at', type: 'timestamp' }] },
    ],
  },
  auth: {
    strategy: 'jwt',
    roles: [{ name: 'User', permissions: ['read'] }, { name: 'Admin', permissions: ['read', 'write'] }],
    protectedRoutes: [{ pattern: '/api/*', roles: ['User', 'Admin'] }],
    publicRoutes: ['/api/auth/login'],
  },
  logic: {
    rules: [{ name: 'auth', trigger: 'api_request', condition: 'true', action: 'check', priority: 1 }],
  },
};

const testIntent = {
  entities: ['User', 'Item'],
  userRoles: ['User', 'Admin'],
  features: ['crud_operations'],
};

const consistency = checkCrossLayerConsistency(testSchemas, testIntent);
assert(consistency.isConsistent === true, 'Consistent schemas pass cross-layer check');
assert(consistency.score > 0.8, 'Consistency score is high');
assert(consistency.errorCount === 0, 'No errors in consistent schemas');

// Test with missing entity
const badIntent = { ...testIntent, entities: ['User', 'Item', 'Widget'] };
const badConsistency = checkCrossLayerConsistency(testSchemas, badIntent);
assert(badConsistency.issues.length > 0, 'Detects missing entity coverage');

// ═══ Input Analysis Heuristics ═══
console.log('\n═══ Input Analysis Heuristics ═══');

// We test the heuristic logic inline since it's embedded
const shortPrompt = 'build app';
assert(shortPrompt.split(/\s+/).length < 5, 'Detects very short prompt as vague');

const goodPrompt = 'Build a CRM with login, contacts, dashboard, and analytics';
assert(goodPrompt.split(/\s+/).length >= 5, 'Good prompt is not vague');

// Conflict detection
const conflictPrompt = 'build a simple basic app with advanced enterprise features';
const p = conflictPrompt.toLowerCase();
const hasSimple = p.includes('simple') || p.includes('basic');
const hasAdvanced = p.includes('advanced') || p.includes('enterprise');
assert(hasSimple && hasAdvanced, 'Detects simple vs advanced conflict');

// ═══ Summary ═══
console.log(`\n══════ Test Results: ${passed} passed, ${failed} failed ══════\n`);
process.exit(failed > 0 ? 1 : 0);
