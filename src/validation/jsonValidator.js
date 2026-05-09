/**
 * JSON Validator & Structural Sanitizer
 * 
 * Uses AJV for strict schema enforcement. Provides:
 *   1. JSON syntax repair (strip markdown, fix common LLM output issues)
 *   2. Schema validation against 7 defined contracts
 *   3. Structural analysis for the repair engine
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ajv = new Ajv({ allErrors: true, useDefaults: true, removeAdditional: true, allowUnionTypes: true });
addFormats(ajv);

// Pre-compile all schema validators
const schemaNames = ['intent', 'design', 'ui', 'api', 'db', 'auth', 'logic'];
const validators = {};

for (const name of schemaNames) {
  try {
    const schemaPath = join(__dirname, '..', 'schemas', `${name}.schema.json`);
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    validators[name] = ajv.compile(schema);
  } catch (err) {
    console.warn(`⚠️  Could not load schema: ${name}.schema.json — ${err.message}`);
  }
}

/**
 * Attempt to parse and repair raw LLM text into valid JSON.
 * Handles common LLM output issues:
 *   - Markdown code fences (```json ... ```)
 *   - Trailing commas
 *   - Single quotes instead of double quotes
 *   - Unquoted keys
 *   - BOM characters
 */
export function attemptJSONRepair(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { success: false, data: null, error: 'Empty or non-string input' };
  }

  let text = rawText.trim();

  // Strip BOM
  text = text.replace(/^\uFEFF/, '');

  // Strip markdown code fences
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  // Strip any preamble text before the first { or [
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let startIdx = -1;
  if (firstBrace >= 0 && firstBracket >= 0) startIdx = Math.min(firstBrace, firstBracket);
  else if (firstBrace >= 0) startIdx = firstBrace;
  else if (firstBracket >= 0) startIdx = firstBracket;
  
  if (startIdx > 0) text = text.substring(startIdx);

  // Strip any trailing text after the last } or ]
  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  const endIdx = Math.max(lastBrace, lastBracket);
  if (endIdx > 0) text = text.substring(0, endIdx + 1);

  // Try parsing directly first
  try {
    const data = JSON.parse(text);
    return { success: true, data, repaired: false };
  } catch (e) {
    // Continue to repair
  }

  // Repair: trailing commas
  let repaired = text.replace(/,\s*([\]}])/g, '$1');

  // Repair: single quotes → double quotes (naive but effective for LLM output)
  repaired = repaired.replace(/'/g, '"');

  // Repair: unquoted keys
  repaired = repaired.replace(/(\{|,)\s*([a-zA-Z_]\w*)\s*:/g, '$1"$2":');

  try {
    const data = JSON.parse(repaired);
    return { success: true, data, repaired: true };
  } catch (e) {
    return { success: false, data: null, error: `JSON repair failed: ${e.message}`, rawText: text };
  }
}

/**
 * Validate a parsed JSON object against a named schema.
 * Returns { valid, errors, data }
 */
export function validateLayer(layerName, data) {
  const validate = validators[layerName];
  if (!validate) {
    return { valid: false, errors: [{ message: `No schema found for layer: ${layerName}` }] };
  }

  const valid = validate(data);
  if (!valid) {
    return {
      valid: false,
      errors: validate.errors.map(e => ({
        path: e.instancePath || '/',
        message: e.message,
        keyword: e.keyword,
        params: e.params,
      })),
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Full pipeline: parse raw text → repair → validate against schema.
 */
export function parseAndValidate(rawText, layerName) {
  const parseResult = attemptJSONRepair(rawText);
  if (!parseResult.success) {
    return { valid: false, data: null, errors: [{ message: parseResult.error }], repaired: false };
  }

  const validation = validateLayer(layerName, parseResult.data);
  return {
    valid: validation.valid,
    data: parseResult.data,
    errors: validation.errors,
    repaired: parseResult.repaired || false,
  };
}

export { schemaNames };
