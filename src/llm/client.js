/**
 * LLM Client — Gemini API wrapper with automatic mock fallback.
 * 
 * Design Decision: The client transparently falls back to mock mode when
 * no API key is configured, allowing the full pipeline to demonstrate
 * its architecture without requiring API access.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG, validateConfig } from '../config.js';

let genAI = null;
let model = null;

function initClient() {
  const { mode } = validateConfig();
  if (mode === 'live' && !genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({
      model: CONFIG.llm.model,
      generationConfig: {
        temperature: CONFIG.llm.temperature,
        topP: CONFIG.llm.topP,
        maxOutputTokens: CONFIG.llm.maxOutputTokens,
      },
    });
  }
}

/**
 * Call the LLM with a prompt. Returns raw text response.
 * In mock mode, generates deterministic structured output based on the stage.
 */
export async function callLLM(prompt, stage = 'unknown', context = null) {
  const { mode } = validateConfig();

  if (mode === 'live') {
    initClient();
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(text.length / 4);
    return { text, inputTokens, outputTokens };
  }

  return generateMockResponse(prompt, stage, context);
}

/**
 * Mock response generator — produces structurally valid output for each pipeline stage.
 * This allows the full system to be demonstrated without API access.
 */
function generateMockResponse(prompt, stage, context = null) {
  const mockResponses = {
    'input-analysis': () => JSON.stringify({
      isValid: true,
      isVague: false,
      hasConflicts: false,
      conflicts: [],
      assumptions: [
        { field: "database", assumed: "PostgreSQL", reason: "Most common for production apps" },
        { field: "hosting", assumed: "Cloud-based", reason: "Standard for modern applications" }
      ],
      clarifications: [],
      enrichedPrompt: extractPromptContent(prompt)
    }),

    'intent-extraction': () => {
      const p = extractPromptContent(prompt).toLowerCase();
      const appName = detectAppName(p);
      const features = detectFeatures(p);
      const entities = detectEntities(p, features);
      const roles = detectRoles(p);
      
      return JSON.stringify({
        appName,
        appType: detectAppType(p),
        description: extractPromptContent(prompt),
        features,
        entities,
        userRoles: roles,
        constraints: { maxUsers: 10000, scalability: "horizontal" }
      });
    },

    'system-design': () => {
      const p = extractPromptContent(prompt).toLowerCase();
      const entities = context?.entities || detectEntities(p, detectFeatures(p));
      const roles = context?.roles || detectRoles(p);
      
      return JSON.stringify({
        entities: entities.map(e => ({
          name: e,
          fields: generateFieldsForEntity(e),
          relationships: []
        })),
        flows: [
          { name: "Authentication", steps: ["Login", "Validate Credentials", "Issue Token", "Redirect to Dashboard"] },
          { name: "CRUD Operations", steps: ["List Items", "Create Item", "Validate Data", "Save to DB", "Return Response"] },
          { name: "Authorization Check", steps: ["Extract Token", "Verify Role", "Check Permissions", "Grant/Deny Access"] }
        ],
        roles: roles.map(r => ({
          name: r,
          permissions: r.toLowerCase() === 'admin' 
            ? ["create", "read", "update", "delete", "manage_users", "view_analytics"]
            : ["create", "read", "update"]
        }))
      });
    },

    'ui-schema': () => {
      const p = extractPromptContent(prompt).toLowerCase();
      const features = context?.features || detectFeatures(p);
      const entities = context?.entities || getEntitiesFromContext(prompt);
      const pages = [
        { name: "Login", route: "/login", components: [{ type: "form", fields: ["email", "password"], actions: ["login", "forgot_password"] }], requiresAuth: false },
        { name: "Dashboard", route: "/dashboard", components: [{ type: "stats_grid", fields: ["total_items", "active_users", "recent_activity"] }, { type: "chart", chartType: "line", dataSource: "activity" }], requiresAuth: true }
      ];
      entities.forEach(entity => {
        if (!['User', 'Session'].includes(entity)) {
          pages.push({
            name: `${entity} List`,
            route: `/${entity.toLowerCase()}s`,
            components: [
              { type: "data_table", columns: generateFieldsForEntity(entity).map(f => f.name), actions: ["view", "edit", "delete"] },
              { type: "button", label: `Add ${entity}`, action: "navigate", target: `/${entity.toLowerCase()}s/new` }
            ],
            requiresAuth: true
          });
          pages.push({
            name: `${entity} Form`,
            route: `/${entity.toLowerCase()}s/:id`,
            components: [
              { type: "form", fields: generateFieldsForEntity(entity).map(f => f.name), actions: ["save", "cancel", "delete"] }
            ],
            requiresAuth: true
          });
        }
      });

      if (features.some(f => f.includes('analytics') || f.includes('report'))) {
        pages.push({ name: "Analytics", route: "/analytics", components: [{ type: "chart", chartType: "bar", dataSource: "metrics" }, { type: "chart", chartType: "pie", dataSource: "distribution" }], requiresAuth: true });
      }

      return JSON.stringify({
        appName: detectAppName(p),
        theme: "modern",
        layout: "sidebar",
        pages
      });
    },

    'api-schema': () => {
      const p = extractPromptContent(prompt).toLowerCase();
      const entities = context?.entities || getEntitiesFromContext(prompt);
      const endpoints = [
        { path: "/api/auth/login", method: "POST", requestBody: { email: "string", password: "string" }, response: { token: "string", user: "object" }, auth: false },
        { path: "/api/auth/register", method: "POST", requestBody: { email: "string", password: "string", name: "string" }, response: { user: "object" }, auth: false },
        { path: "/api/auth/me", method: "GET", requestBody: null, response: { user: "object" }, auth: true }
      ];

      entities.forEach(entity => {
        if (!['User', 'Session'].includes(entity)) {
          const fields = generateFieldsForEntity(entity);
          const body = {};
          fields.forEach(f => { body[f.name] = f.type; });
          endpoints.push(
            { path: `/api/${entity.toLowerCase()}s`, method: "GET", requestBody: null, response: { items: "array", total: "number" }, auth: true },
            { path: `/api/${entity.toLowerCase()}s`, method: "POST", requestBody: body, response: { item: "object" }, auth: true },
            { path: `/api/${entity.toLowerCase()}s/:id`, method: "GET", requestBody: null, response: { item: "object" }, auth: true },
            { path: `/api/${entity.toLowerCase()}s/:id`, method: "PUT", requestBody: body, response: { item: "object" }, auth: true },
            { path: `/api/${entity.toLowerCase()}s/:id`, method: "DELETE", requestBody: null, response: { success: "boolean" }, auth: true }
          );
        }
      });

      return JSON.stringify({ basePath: "/api", version: "v1", endpoints });
    },

    'db-schema': () => {
      const p = extractPromptContent(prompt).toLowerCase();
      const entities = context?.entities || getEntitiesFromContext(prompt);
      const tables = [
        {
          name: "users",
          columns: [
            { name: "id", type: "uuid", primaryKey: true },
            { name: "email", type: "varchar(255)", unique: true, nullable: false },
            { name: "password_hash", type: "varchar(255)", nullable: false },
            { name: "name", type: "varchar(255)", nullable: false },
            { name: "role", type: "varchar(50)", default: "user" },
            { name: "created_at", type: "timestamp", default: "now()" },
            { name: "updated_at", type: "timestamp", default: "now()" }
          ],
          indexes: [{ columns: ["email"], unique: true }]
        }
      ];

      entities.forEach(entity => {
        if (!['User', 'Session'].includes(entity)) {
          const fields = generateFieldsForEntity(entity);
          const columns = [
            { name: "id", type: "uuid", primaryKey: true },
            ...fields.map(f => ({
              name: f.name.toLowerCase().replace(/\s+/g, '_'),
              type: mapFieldToDBType(f.type),
              nullable: !f.required
            })),
            { name: "user_id", type: "uuid", nullable: false, foreignKey: { table: "users", column: "id" } },
            { name: "created_at", type: "timestamp", default: "now()" },
            { name: "updated_at", type: "timestamp", default: "now()" }
          ];
          tables.push({
            name: `${entity.toLowerCase()}s`,
            columns,
            indexes: [{ columns: ["user_id"] }]
          });
        }
      });

      return JSON.stringify({ dialect: "postgresql", tables });
    },

    'auth-schema': () => {
      const p = extractPromptContent(prompt).toLowerCase();
      const roles = context?.roles || getRolesFromContext(prompt);
      const hasPremium = p.includes('premium') || p.includes('payment');
      return JSON.stringify({
        strategy: "jwt",
        tokenExpiry: "24h",
        refreshTokenExpiry: "7d",
        roles: roles.map(r => ({
          name: r,
          permissions: r.toLowerCase() === 'admin'
            ? ["create", "read", "update", "delete", "manage_users", "view_analytics", "manage_settings"]
            : ["create", "read", "update", "view_own"]
        })),
        protectedRoutes: [
          { pattern: "/api/admin/*", roles: ["Admin"] },
          { pattern: "/api/*", roles: roles },
          { pattern: "/dashboard", roles: roles },
          { pattern: "/analytics", roles: ["Admin"] }
        ],
        publicRoutes: ["/api/auth/login", "/api/auth/register", "/login"]
      });
    },

    'logic-schema': () => {
      const p = extractPromptContent(prompt).toLowerCase();
      const hasPremium = p.includes('premium') || p.includes('payment') || p.includes('subscription') || p.includes('plan');
      
      const rules = [
        { name: "authentication_required", trigger: "api_request", condition: "!token.valid && route.protected", action: "return_401", priority: 1 },
        { name: "role_based_access", trigger: "api_request", condition: "user.role NOT IN route.allowedRoles", action: "return_403", priority: 2 },
        { name: "input_validation", trigger: "data_mutation", condition: "!validate(request.body, schema)", action: "return_422", priority: 3 },
        { name: "audit_logging", trigger: "data_mutation", condition: "always", action: "log_to_audit_table", priority: 10 }
      ];

      if (hasPremium) {
        rules.push(
          { name: "premium_gating", trigger: "feature_access", condition: "feature.tier === 'premium' && user.plan === 'free'", action: "return_403_upgrade_required", priority: 2 },
          { name: "payment_validation", trigger: "subscription_change", condition: "plan.price > 0", action: "process_payment_then_upgrade", priority: 1 }
        );
      }

      return JSON.stringify({
        rules,
        workflows: [
          { name: "user_onboarding", steps: ["validate_email", "create_account", "assign_default_role", "send_welcome_email"] },
          { name: "data_lifecycle", steps: ["validate_input", "check_permissions", "apply_business_rules", "persist_data", "notify_subscribers"] }
        ]
      });
    },

    'refinement': () => JSON.stringify({ refined: true, changes: [], isConsistent: true }),
  };

  const generator = mockResponses[stage] || mockResponses['input-analysis'];
  const text = generator();
  return {
    text,
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(text.length / 4),
  };
}

// --- Utility functions for intelligent mock generation ---

function extractPromptContent(prompt) {
  const match = prompt.match(/User Prompt:\s*"([^"]+)"/i) || prompt.match(/Prompt:\s*"([^"]+)"/i);
  if (match) return match[1];
  const lines = prompt.split('\n').filter(l => l.trim().length > 10);
  return lines[lines.length - 1] || prompt.substring(0, 200);
}

/**
 * Extract design/intent data embedded in the prompt (from Stage 2 output passed to Stage 3).
 * This ensures schema stages produce entities consistent with the design stage.
 */
function extractDesignFromPrompt(prompt) {
  try {
    // Look for the JSON block in the System Design section of the prompt
    const jsonMatch = prompt.match(/System Design:\s*\n(\{[\s\S]+?\}\s*\n\n)/m) ||
                      prompt.match(/Intent Specification:\s*\n(\{[\s\S]+?\}\s*\n\n)/m);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    // Try to find any JSON block with entities array
    const entitiesMatch = prompt.match(/(\{[^{}]*"entities"[^{}]*\[[^\]]+\][^{}]*\})/s);
    if (entitiesMatch) return JSON.parse(entitiesMatch[1]);
  } catch (e) { /* ignore parse errors */ }
  return null;
}

/**
 * Get entities from design JSON embedded in the prompt, or fall back to prompt detection.
 */
function getEntitiesFromContext(prompt) {
  const design = extractDesignFromPrompt(prompt);
  if (design?.entities && Array.isArray(design.entities)) {
    return design.entities.map(e => typeof e === 'string' ? e : e.name).filter(Boolean);
  }
  const p = extractPromptContent(prompt).toLowerCase();
  return detectEntities(p, detectFeatures(p));
}

function getRolesFromContext(prompt) {
  const design = extractDesignFromPrompt(prompt);
  if (design?.roles && Array.isArray(design.roles)) {
    return design.roles.map(r => typeof r === 'string' ? r : r.name).filter(Boolean);
  }
  const p = extractPromptContent(prompt).toLowerCase();
  return detectRoles(p);
}

function detectAppName(p) {
  const typeMap = {
    'crm': 'ProCRM', 'task': 'TaskMaster', 'note': 'NotesApp', 'blog': 'BlogEngine',
    'ecommerce': 'ShopHub', 'e-commerce': 'ShopHub', 'shop': 'ShopHub', 'store': 'ShopHub',
    'chat': 'ChatConnect', 'message': 'ChatConnect', 'social': 'SocialNet',
    'health': 'HealthPortal', 'medical': 'HealthPortal', 'doctor': 'HealthPortal',
    'booking': 'BookingSystem', 'appointment': 'BookingSystem', 'schedule': 'ScheduleApp',
    'inventory': 'InventoryPro', 'project': 'ProjectHub', 'learn': 'LearnPlatform',
    'course': 'LearnPlatform', 'education': 'EduPlatform', 'restaurant': 'FoodieApp',
    'food': 'FoodieApp', 'recipe': 'RecipeBook', 'fitness': 'FitTracker',
    'finance': 'FinanceTracker', 'budget': 'BudgetApp', 'hr': 'HRManager',
    'employee': 'HRManager', 'ticket': 'TicketDesk', 'support': 'SupportDesk',
    'forum': 'ForumApp', 'wiki': 'WikiEngine', 'survey': 'SurveyTool',
    'poll': 'PollMaker', 'real estate': 'PropertyHub', 'property': 'PropertyHub',
  };
  for (const [key, name] of Object.entries(typeMap)) {
    if (p.includes(key)) return name;
  }
  return 'AppBuilder';
}

function detectAppType(p) {
  if (p.includes('api') && !p.includes('ui') && !p.includes('frontend')) return 'api';
  if (p.includes('mobile')) return 'mobile';
  if (p.includes('dashboard') || p.includes('admin')) return 'dashboard';
  return 'fullstack';
}

function detectFeatures(p) {
  const featureMap = {
    'login': 'user_authentication', 'auth': 'user_authentication', 'register': 'user_registration',
    'signup': 'user_registration', 'dashboard': 'dashboard', 'analytics': 'analytics_dashboard',
    'report': 'reporting', 'search': 'search_functionality', 'filter': 'filtering',
    'notification': 'notifications', 'email': 'email_integration', 'upload': 'file_upload',
    'image': 'image_management', 'payment': 'payment_processing', 'subscription': 'subscription_management',
    'premium': 'premium_features', 'role': 'role_based_access', 'permission': 'permission_management',
    'chat': 'real_time_chat', 'message': 'messaging', 'comment': 'commenting_system',
    'review': 'review_system', 'rating': 'rating_system', 'export': 'data_export',
    'import': 'data_import', 'profile': 'user_profiles', 'settings': 'user_settings',
    'crud': 'crud_operations', 'contact': 'contact_management', 'calendar': 'calendar',
    'map': 'maps_integration', 'api': 'rest_api', 'webhook': 'webhooks',
  };

  const features = ['user_authentication', 'crud_operations'];
  for (const [keyword, feature] of Object.entries(featureMap)) {
    if (p.includes(keyword) && !features.includes(feature)) {
      features.push(feature);
    }
  }
  return features;
}

function detectEntities(p, features) {
  const entities = ['User'];
  const entityMap = {
    'contact': 'Contact', 'task': 'Task', 'note': 'Note', 'post': 'Post', 'blog': 'Post',
    'product': 'Product', 'item': 'Item', 'order': 'Order', 'cart': 'Cart',
    'message': 'Message', 'comment': 'Comment', 'review': 'Review',
    'appointment': 'Appointment', 'booking': 'Booking', 'event': 'Event',
    'ticket': 'Ticket', 'project': 'Project', 'course': 'Course',
    'lesson': 'Lesson', 'category': 'Category', 'tag': 'Tag',
    'invoice': 'Invoice', 'payment': 'Payment', 'subscription': 'Subscription',
    'employee': 'Employee', 'department': 'Department', 'patient': 'Patient',
    'doctor': 'Doctor', 'recipe': 'Recipe', 'property': 'Property',
    'listing': 'Listing', 'survey': 'Survey', 'response': 'Response',
  };
  for (const [keyword, entity] of Object.entries(entityMap)) {
    if (p.includes(keyword) && !entities.includes(entity)) {
      entities.push(entity);
    }
  }
  // If no specific entities found, derive from features
  if (entities.length === 1) {
    if (features.includes('crud_operations')) entities.push('Item');
    if (features.includes('contact_management')) entities.push('Contact');
  }
  return entities;
}

function detectRoles(p) {
  const roles = ['User'];
  if (p.includes('admin')) roles.push('Admin');
  if (p.includes('manager')) roles.push('Manager');
  if (p.includes('editor')) roles.push('Editor');
  if (p.includes('moderator')) roles.push('Moderator');
  if (p.includes('viewer') || p.includes('guest')) roles.push('Viewer');
  if (roles.length === 1) roles.push('Admin'); // Default: always have Admin
  return roles;
}

function generateFieldsForEntity(entityName) {
  const fieldMaps = {
    'Contact': [
      { name: 'name', type: 'string', required: true },
      { name: 'email', type: 'string', required: true },
      { name: 'phone', type: 'string', required: false },
      { name: 'company', type: 'string', required: false },
      { name: 'notes', type: 'text', required: false },
    ],
    'Task': [
      { name: 'title', type: 'string', required: true },
      { name: 'description', type: 'text', required: false },
      { name: 'status', type: 'enum', required: true },
      { name: 'priority', type: 'enum', required: true },
      { name: 'due_date', type: 'date', required: false },
    ],
    'Note': [
      { name: 'title', type: 'string', required: true },
      { name: 'content', type: 'text', required: true },
      { name: 'tags', type: 'array', required: false },
    ],
    'Post': [
      { name: 'title', type: 'string', required: true },
      { name: 'content', type: 'text', required: true },
      { name: 'slug', type: 'string', required: true },
      { name: 'published', type: 'boolean', required: true },
      { name: 'category', type: 'string', required: false },
    ],
    'Product': [
      { name: 'name', type: 'string', required: true },
      { name: 'description', type: 'text', required: false },
      { name: 'price', type: 'number', required: true },
      { name: 'sku', type: 'string', required: true },
      { name: 'stock', type: 'number', required: true },
    ],
    'Order': [
      { name: 'order_number', type: 'string', required: true },
      { name: 'status', type: 'enum', required: true },
      { name: 'total', type: 'number', required: true },
      { name: 'items', type: 'array', required: true },
    ],
    'Appointment': [
      { name: 'title', type: 'string', required: true },
      { name: 'date', type: 'datetime', required: true },
      { name: 'duration_minutes', type: 'number', required: true },
      { name: 'status', type: 'enum', required: true },
      { name: 'notes', type: 'text', required: false },
    ],
    'Ticket': [
      { name: 'subject', type: 'string', required: true },
      { name: 'description', type: 'text', required: true },
      { name: 'status', type: 'enum', required: true },
      { name: 'priority', type: 'enum', required: true },
      { name: 'assigned_to', type: 'string', required: false },
    ],
    'Project': [
      { name: 'name', type: 'string', required: true },
      { name: 'description', type: 'text', required: false },
      { name: 'status', type: 'enum', required: true },
      { name: 'start_date', type: 'date', required: true },
      { name: 'end_date', type: 'date', required: false },
    ],
  };

  return fieldMaps[entityName] || [
    { name: 'name', type: 'string', required: true },
    { name: 'description', type: 'text', required: false },
    { name: 'status', type: 'enum', required: true },
    { name: 'metadata', type: 'json', required: false },
  ];
}

function mapFieldToDBType(fieldType) {
  const map = {
    'string': 'varchar(255)', 'text': 'text', 'number': 'integer',
    'boolean': 'boolean', 'date': 'date', 'datetime': 'timestamp',
    'enum': 'varchar(50)', 'array': 'jsonb', 'json': 'jsonb', 'uuid': 'uuid',
  };
  return map[fieldType] || 'varchar(255)';
}
