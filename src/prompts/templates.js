/**
 * Compiler Prompt Templates
 * 
 * Each function returns a structured prompt that forces JSON-only output.
 * These act as the "grammar rules" of the compiler — each stage has a
 * precise specification for what the LLM must produce.
 * 
 * Design Decision: Every prompt includes:
 *   1. Role assignment (system-level context)
 *   2. Strict JSON enforcement
 *   3. Schema specification (expected output structure)
 *   4. Input data from previous stages
 */

const JSON_ENFORCEMENT = `You MUST respond with ONLY valid JSON. No markdown, no code fences, no explanations, no preamble. Just the raw JSON object. If you include anything other than JSON, the system will fail.`;

export function inputAnalysisPrompt(userPrompt) {
  return `You are a requirements analyst for a software generation compiler.

${JSON_ENFORCEMENT}

Analyze the following user prompt for:
1. Vagueness — is the prompt too short or unclear to generate an application?
2. Conflicts — are there contradictory requirements?
3. Assumptions — what reasonable assumptions must be made for underspecified areas?

User Prompt: "${userPrompt}"

Respond with this exact JSON structure:
{
  "isValid": boolean,
  "isVague": boolean,
  "hasConflicts": boolean,
  "conflicts": [{ "field": "string", "conflict": "string" }],
  "assumptions": [{ "field": "string", "assumed": "string", "reason": "string" }],
  "clarifications": ["string"],
  "enrichedPrompt": "string (the original prompt, enriched with context)"
}`;
}

export function intentPrompt(enrichedPrompt) {
  return `You are a software intent parser. Extract structured intent from a natural language software description.

${JSON_ENFORCEMENT}

User Prompt: "${enrichedPrompt}"

Extract and return this JSON:
{
  "appName": "string (PascalCase, derived from the app concept)",
  "appType": "fullstack|api|dashboard|mobile|saas",
  "description": "string (1-2 sentence summary)",
  "features": ["string (feature identifiers like 'user_authentication', 'crud_operations', 'dashboard')"],
  "entities": ["string (data entities like 'User', 'Task', 'Product')"],
  "userRoles": ["string (roles like 'User', 'Admin', 'Manager')"],
  "constraints": { "maxUsers": number, "scalability": "string" }
}`;
}

export function designPrompt(intentJson) {
  return `You are a software architect. Convert the following intent specification into a system design.

${JSON_ENFORCEMENT}

Intent Specification:
${JSON.stringify(intentJson, null, 2)}

Generate the system design with this structure:
{
  "entities": [
    {
      "name": "string",
      "fields": [{ "name": "string", "type": "string", "required": boolean }],
      "relationships": [{ "target": "string", "type": "one-to-many|many-to-many|one-to-one" }]
    }
  ],
  "flows": [
    {
      "name": "string (e.g., 'Authentication', 'CRUD Operations')",
      "steps": ["string"]
    }
  ],
  "roles": [
    {
      "name": "string",
      "permissions": ["string"]
    }
  ]
}

Rules:
- Every entity in the intent MUST appear in the design
- Every role in the intent MUST have permissions defined
- Include at least Authentication and CRUD flows`;
}

export function uiSchemaPrompt(designJson) {
  return `You are a UI architect. Generate a UI schema from the system design.

${JSON_ENFORCEMENT}

System Design:
${JSON.stringify(designJson, null, 2)}

Generate UI configuration:
{
  "appName": "string",
  "theme": "modern",
  "layout": "sidebar|topbar",
  "pages": [
    {
      "name": "string",
      "route": "/path",
      "components": [
        {
          "type": "form|data_table|chart|stats_grid|button",
          "fields": ["string"] or "columns": ["string"],
          "actions": ["string"]
        }
      ],
      "requiresAuth": boolean
    }
  ]
}

Rules:
- MUST include a Login page (requiresAuth: false)
- MUST include a Dashboard page
- Every entity in the design MUST have list and detail pages
- Form fields MUST match entity fields from the design`;
}

export function apiSchemaPrompt(designJson) {
  return `You are an API architect. Generate REST API endpoints from the system design.

${JSON_ENFORCEMENT}

System Design:
${JSON.stringify(designJson, null, 2)}

Generate API configuration:
{
  "basePath": "/api",
  "version": "v1",
  "endpoints": [
    {
      "path": "/api/resource",
      "method": "GET|POST|PUT|DELETE",
      "requestBody": { "field": "type" } or null,
      "response": { "field": "type" },
      "auth": boolean
    }
  ]
}

Rules:
- MUST include auth endpoints (login, register, me)
- Every entity MUST have full CRUD endpoints (GET list, POST create, GET by id, PUT update, DELETE)
- Request body fields MUST match entity fields from the design
- Auth endpoints have auth: false, all others have auth: true`;
}

export function dbSchemaPrompt(designJson) {
  return `You are a database architect. Generate a relational database schema from the system design.

${JSON_ENFORCEMENT}

System Design:
${JSON.stringify(designJson, null, 2)}

Generate database configuration:
{
  "dialect": "postgresql",
  "tables": [
    {
      "name": "string (lowercase, plural)",
      "columns": [
        {
          "name": "string",
          "type": "uuid|varchar(255)|text|integer|boolean|timestamp|date|jsonb",
          "primaryKey": boolean,
          "unique": boolean,
          "nullable": boolean,
          "default": "string or null",
          "foreignKey": { "table": "string", "column": "string" } or undefined
        }
      ],
      "indexes": [{ "columns": ["string"], "unique": boolean }]
    }
  ]
}

Rules:
- MUST include a users table
- Every entity MUST have a corresponding table
- All tables MUST have id (uuid, primary key), created_at, updated_at
- Entity tables MUST have user_id foreign key to users table
- Column types MUST match entity field types from the design`;
}

export function authSchemaPrompt(designJson, intentJson) {
  return `You are a security architect. Generate an authentication and authorization schema.

${JSON_ENFORCEMENT}

System Design:
${JSON.stringify(designJson, null, 2)}

Intent (roles):
${JSON.stringify({ userRoles: intentJson.userRoles, features: intentJson.features }, null, 2)}

Generate auth configuration:
{
  "strategy": "jwt",
  "tokenExpiry": "24h",
  "refreshTokenExpiry": "7d",
  "roles": [
    {
      "name": "string",
      "permissions": ["string"]
    }
  ],
  "protectedRoutes": [
    {
      "pattern": "/api/path/*",
      "roles": ["string"]
    }
  ],
  "publicRoutes": ["/api/auth/login", "/api/auth/register", "/login"]
}

Rules:
- Every role from the intent MUST be defined
- Admin role MUST have all permissions
- Protected routes MUST cover all API endpoints
- Public routes MUST include auth endpoints`;
}

export function logicSchemaPrompt(designJson, intentJson) {
  return `You are a business logic architect. Generate business rules and workflows.

${JSON_ENFORCEMENT}

System Design:
${JSON.stringify(designJson, null, 2)}

Intent:
${JSON.stringify({ features: intentJson.features, entities: intentJson.entities }, null, 2)}

Generate business logic configuration:
{
  "rules": [
    {
      "name": "string (snake_case)",
      "trigger": "string (e.g., 'api_request', 'data_mutation', 'feature_access')",
      "condition": "string (logical condition)",
      "action": "string (what happens)",
      "priority": number (1 = highest)
    }
  ],
  "workflows": [
    {
      "name": "string",
      "steps": ["string"]
    }
  ]
}

Rules:
- MUST include authentication_required rule
- MUST include role_based_access rule
- MUST include input_validation rule
- If premium features exist, MUST include premium_gating rule
- Workflows MUST cover user_onboarding and data_lifecycle`;
}

export function refinementPrompt(schemas, intent) {
  return `You are a quality assurance engineer. Review the following generated schemas for cross-layer consistency.

${JSON_ENFORCEMENT}

Intent: ${JSON.stringify(intent, null, 2)}

Generated Schemas:
- UI: ${JSON.stringify(schemas.ui, null, 2)}
- API: ${JSON.stringify(schemas.api, null, 2)}
- DB: ${JSON.stringify(schemas.db, null, 2)}
- Auth: ${JSON.stringify(schemas.auth, null, 2)}
- Logic: ${JSON.stringify(schemas.logic, null, 2)}

Check for:
1. API endpoints must have corresponding DB tables
2. UI page fields must map to API response fields
3. Auth roles must cover all protected routes
4. Logic rules must reference valid entities

Respond with:
{
  "refined": boolean,
  "changes": [{ "layer": "string", "field": "string", "issue": "string", "fix": "string" }],
  "isConsistent": boolean
}`;
}
