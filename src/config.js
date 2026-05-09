/**
 * Application Configuration
 * Enforces deterministic behavior through strict LLM parameter control.
 * 
 * Design Decision: temperature=0 forces maximum determinism from the LLM.
 * topP=0.1 further constrains token sampling to the most probable outputs.
 */
import 'dotenv/config';

export const CONFIG = {
  llm: {
    model: 'gemini-2.0-flash',
    temperature: 0.0,
    topP: 0.1,
    maxOutputTokens: 8192,
    maxRetries: 3,
  },
  pipeline: {
    stages: ['input-analysis', 'intent-extraction', 'system-design', 'schema-codegen', 'refinement', 'execution-simulation'],
    schemaLayers: ['ui', 'api', 'db', 'auth', 'logic'],
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
  },
};

/**
 * Validates that the runtime environment is properly configured.
 * Returns { valid, mode, warnings }
 */
export function validateConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  const warnings = [];
  let mode = 'live';

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    warnings.push('GEMINI_API_KEY not set or placeholder. Running in MOCK mode.');
    mode = 'mock';
  }

  return { valid: true, mode, warnings };
}
