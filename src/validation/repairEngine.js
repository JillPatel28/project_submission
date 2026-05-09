/**
 * Repair Engine — Intelligent, stage-aware healing.
 * 
 * This is the CORE differentiator of the compiler. Instead of brute-force retrying
 * the entire generation, it:
 *   1. Diagnoses the specific failure type (syntax vs structural vs semantic)
 *   2. Applies the minimum fix needed
 *   3. Only re-generates specific parts via targeted LLM calls
 * 
 * Repair Hierarchy:
 *   Level 0: JSON Syntax Recovery (no LLM needed)
 *   Level 1: Structural Repair — inject missing keys with defaults
 *   Level 2: Targeted Re-generation — ask LLM to fix specific fields
 */
import { attemptJSONRepair, validateLayer } from './jsonValidator.js';
import { callLLM } from '../llm/client.js';

/**
 * Attempt to repair a failed stage output.
 * @param {string} rawText - The raw LLM output text
 * @param {string} layerName - Which schema layer this belongs to
 * @param {string} originalPrompt - The original prompt (for re-generation)
 * @param {number} maxRetries - Maximum repair attempts
 * @returns {{ data, repairLog, attempts }}
 */
export async function repairStageOutput(rawText, layerName, originalPrompt, maxRetries = 3) {
  const repairLog = [];
  let currentText = rawText;
  let attempts = 0;

  for (let i = 0; i < maxRetries; i++) {
    attempts++;

    // --- Level 0: JSON Syntax Recovery ---
    const parseResult = attemptJSONRepair(currentText);
    if (!parseResult.success) {
      repairLog.push({ level: 0, action: 'json_syntax_repair', success: false, error: parseResult.error });
      
      // If JSON is completely broken, re-generate via LLM
      repairLog.push({ level: 2, action: 'full_regeneration', reason: 'Unparseable JSON' });
      const regen = await callLLM(
        `${originalPrompt}\n\nCRITICAL: Your previous response was not valid JSON. Respond with ONLY a valid JSON object. No markdown, no explanations.`,
        layerName
      );
      currentText = regen.text;
      continue;
    }

    if (parseResult.repaired) {
      repairLog.push({ level: 0, action: 'json_syntax_repair', success: true, detail: 'Fixed syntax issues' });
    }

    // --- Level 1: Structural Validation ---
    const validation = validateLayer(layerName, parseResult.data);
    if (validation.valid) {
      repairLog.push({ level: 1, action: 'schema_validation', success: true });
      return { data: parseResult.data, repairLog, attempts, success: true };
    }

    // --- Level 1b: Structural Repair — inject missing fields ---
    const structurallyRepaired = applyStructuralDefaults(parseResult.data, layerName, validation.errors);
    const revalidation = validateLayer(layerName, structurallyRepaired);
    if (revalidation.valid) {
      repairLog.push({ level: 1, action: 'structural_repair', success: true, fixedErrors: validation.errors.length });
      return { data: structurallyRepaired, repairLog, attempts, success: true };
    }

    // --- Level 2: Targeted Re-generation ---
    const errorSummary = revalidation.errors.map(e => `${e.path}: ${e.message}`).join('; ');
    repairLog.push({ level: 2, action: 'targeted_regeneration', reason: errorSummary });

    const fixPrompt = `${originalPrompt}

Your previous output had these schema validation errors:
${errorSummary}

Fix ONLY the problematic fields. Return the complete, corrected JSON object.
CRITICAL: Respond with ONLY valid JSON. No markdown, no explanations.`;

    const fixResult = await callLLM(fixPrompt, layerName);
    currentText = fixResult.text;
  }

  // Final attempt to parse whatever we have
  const finalParse = attemptJSONRepair(currentText);
  if (finalParse.success) {
    repairLog.push({ level: 'final', action: 'best_effort_parse', success: true });
    return { data: finalParse.data, repairLog, attempts, success: true };
  }

  repairLog.push({ level: 'final', action: 'repair_exhausted', success: false });
  return { data: null, repairLog, attempts, success: false };
}

/**
 * Apply structural defaults for missing required fields.
 * This avoids an LLM call for simple omissions.
 */
function applyStructuralDefaults(data, layerName, errors) {
  const result = JSON.parse(JSON.stringify(data)); // Deep clone

  const defaults = {
    intent: {
      appName: 'GeneratedApp',
      appType: 'fullstack',
      description: 'AI-generated application',
      features: ['crud_operations'],
      entities: ['Item'],
      userRoles: ['User', 'Admin'],
      constraints: {},
    },
    design: {
      entities: [],
      flows: [{ name: 'Authentication', steps: ['Login', 'Validate', 'Authorize'] }],
      roles: [{ name: 'User', permissions: ['read'] }],
    },
    ui: {
      appName: 'App',
      theme: 'modern',
      layout: 'sidebar',
      pages: [{ name: 'Dashboard', route: '/dashboard', components: [{ type: 'stats_grid' }], requiresAuth: true }],
    },
    api: {
      basePath: '/api',
      version: 'v1',
      endpoints: [{ path: '/api/auth/login', method: 'POST', auth: false }],
    },
    db: {
      dialect: 'postgresql',
      tables: [{ name: 'users', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] }],
    },
    auth: {
      strategy: 'jwt',
      tokenExpiry: '24h',
      roles: [{ name: 'User', permissions: ['read'] }],
    },
    logic: {
      rules: [{ name: 'auth_required', trigger: 'api_request', condition: '!token.valid', action: 'return_401', priority: 1 }],
      workflows: [],
    },
  };

  const layerDefaults = defaults[layerName];
  if (!layerDefaults) return result;

  // Inject missing top-level keys
  for (const [key, defaultValue] of Object.entries(layerDefaults)) {
    if (result[key] === undefined || result[key] === null) {
      result[key] = defaultValue;
    }
    // Fix empty arrays for required array fields
    if (Array.isArray(defaultValue) && Array.isArray(result[key]) && result[key].length === 0) {
      result[key] = defaultValue;
    }
  }

  return result;
}
