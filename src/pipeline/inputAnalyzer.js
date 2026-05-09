/**
 * Stage 0: Input Analyzer
 * 
 * Pre-flight check that handles real-world messiness:
 *   - Detects vague/insufficient prompts
 *   - Identifies conflicting requirements
 *   - Makes documented assumptions for underspecified areas
 *   - Enriches the prompt with context
 */
import { callLLM } from '../llm/client.js';
import { inputAnalysisPrompt } from '../prompts/templates.js';
import { attemptJSONRepair } from '../validation/jsonValidator.js';

// Known conflict patterns
const CONFLICT_PATTERNS = [
  { keywords: ['simple', 'basic'], conflictsWith: ['advanced', 'complex', 'enterprise'], field: 'complexity' },
  { keywords: ['free', 'no cost'], conflictsWith: ['payment', 'subscription', 'premium'], field: 'monetization' },
  { keywords: ['public', 'open'], conflictsWith: ['private', 'restricted', 'authenticated'], field: 'access' },
  { keywords: ['offline'], conflictsWith: ['real-time', 'live', 'streaming'], field: 'connectivity' },
  { keywords: ['single user'], conflictsWith: ['team', 'collaboration', 'multi-tenant'], field: 'users' },
];

/**
 * Analyze user input for quality, conflicts, and assumptions.
 */
export async function analyzeInput(userPrompt) {
  const startTime = Date.now();

  // Quick heuristic checks first (no LLM needed)
  const heuristics = runHeuristicChecks(userPrompt);

  // Call LLM for deeper analysis
  const prompt = inputAnalysisPrompt(userPrompt);
  const result = await callLLM(prompt, 'input-analysis');
  const parsed = attemptJSONRepair(result.text);

  let analysis;
  if (parsed.success) {
    analysis = parsed.data;
    // Merge heuristic findings with LLM analysis
    if (heuristics.isVague) analysis.isVague = true;
    if (heuristics.conflicts.length > 0) {
      analysis.hasConflicts = true;
      analysis.conflicts = [...(analysis.conflicts || []), ...heuristics.conflicts];
    }
  } else {
    // Fallback to heuristic-only analysis
    analysis = {
      isValid: !heuristics.isVague,
      isVague: heuristics.isVague,
      hasConflicts: heuristics.conflicts.length > 0,
      conflicts: heuristics.conflicts,
      assumptions: heuristics.assumptions,
      clarifications: heuristics.isVague ? ['Please provide more details about the application you want to build'] : [],
      enrichedPrompt: userPrompt,
    };
  }

  return {
    analysis,
    latencyMs: Date.now() - startTime,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

function runHeuristicChecks(prompt) {
  const p = prompt.toLowerCase().trim();
  const words = p.split(/\s+/);

  // Vagueness detection
  const isVague = words.length < 5 ||
    ['build something', 'make app', 'create thing', 'build app'].some(v => p.includes(v) && words.length < 8) ||
    ['help', 'anything', 'whatever', 'something'].includes(p);

  // Conflict detection
  const conflicts = [];
  for (const pattern of CONFLICT_PATTERNS) {
    const hasA = pattern.keywords.some(k => p.includes(k));
    const hasB = pattern.conflictsWith.some(k => p.includes(k));
    if (hasA && hasB) {
      conflicts.push({
        field: pattern.field,
        conflict: `Prompt contains both "${pattern.keywords.find(k => p.includes(k))}" and "${pattern.conflictsWith.find(k => p.includes(k))}"`,
      });
    }
  }

  // Assumption generation for underspecified areas
  const assumptions = [];
  if (!p.includes('database') && !p.includes('db') && !p.includes('sql') && !p.includes('mongo')) {
    assumptions.push({ field: 'database', assumed: 'PostgreSQL', reason: 'Most common for production apps' });
  }
  if (!p.includes('auth') && !p.includes('login') && !p.includes('register')) {
    assumptions.push({ field: 'authentication', assumed: 'JWT-based auth included', reason: 'Standard for web applications' });
  }
  if (!p.includes('deploy') && !p.includes('host')) {
    assumptions.push({ field: 'deployment', assumed: 'Cloud-based hosting', reason: 'Standard for modern apps' });
  }
  if (!p.includes('mobile') && !p.includes('ios') && !p.includes('android')) {
    assumptions.push({ field: 'platform', assumed: 'Web application', reason: 'Default target platform' });
  }

  return { isVague, conflicts, assumptions };
}
