# AI Application Compiler

A compiler-style system for software generation: **Natural Language → Structured Config → Validated → Executable.**

## Architecture

The system is built as a **Multi-Stage Generation Pipeline** modeled after a traditional compiler:

```
User Prompt → Input Analysis → Intent Extraction → System Design → Schema Codegen → Refinement → Execution Simulation → Validated Output
```

### Pipeline Stages

| Stage | Purpose | Module |
|-------|---------|--------|
| 0 | **Input Analysis** — Detects vague prompts, conflicts, generates assumptions | `inputAnalyzer.js` |
| 1 | **Intent Extraction** — NL → Structured IR (entities, features, roles) | LLM + `templates.js` |
| 2 | **System Design** — IR → Architecture (entities, flows, relationships) | LLM + `templates.js` |
| 3 | **Schema Codegen** — Architecture → 5 Schema Layers (UI, API, DB, Auth, Logic) | LLM + `templates.js` |
| 4 | **Cross-Layer Refinement** — Validates consistency across all layers | `crossLayerChecker.js` |
| 5 | **Execution Simulation** — Dry-run verification of the generated app | `executionSimulator.js` |

### Core Systems

- **Repair Engine** (`repairEngine.js`): 3-level intelligent repair — L0: JSON syntax, L1: structural defaults, L2: targeted LLM re-generation. Never does blind full retry.
- **Schema Enforcement** (`jsonValidator.js`): AJV-based validation against 7 JSON schemas with type safety and cross-layer consistency.
- **Cost Tracker** (`costTracker.js`): Per-stage instrumentation tracking tokens, latency, cost, and quality/cost tradeoffs.
- **Evaluation Framework** (`evaluate.js`): 20 test cases (10 real products, 10 edge cases) with aggregate metrics.

## Quick Start

```bash
# Install dependencies
npm install

# Create .env file with your API key (optional — mock mode works without it)
cp .env.example .env

# Run the web dashboard
npm run start:web

# Run the CLI pipeline
npm start

# Run with a custom prompt
npm start "Build a CRM with login, contacts, dashboard, and analytics"

# Run unit tests
npm test

# Run 20-case evaluation
npm run evaluate
```

## Project Structure

```
src/
├── config.js              # Deterministic LLM configuration
├── costTracker.js         # Token/cost/quality tracking
├── server.js              # Express API server
├── index.js               # CLI entry point
├── evaluate.js            # 20-case evaluation framework
├── llm/
│   └── client.js          # Gemini API client + mock fallback
├── pipeline/
│   ├── compiler.js        # Main orchestrator (6 stages)
│   ├── inputAnalyzer.js   # Stage 0: Input validation
│   ├── executionSimulator.js  # Stage 5: Dry-run checks
├── validation/
│   ├── jsonValidator.js   # AJV schema validation + JSON repair
│   ├── repairEngine.js    # 3-level intelligent repair
│   └── crossLayerChecker.js   # Cross-layer consistency
├── prompts/
│   └── templates.js       # Structured prompt templates
├── schemas/               # 7 JSON Schema definitions
│   ├── intent.schema.json
│   ├── design.schema.json
│   ├── ui.schema.json
│   ├── api.schema.json
│   ├── db.schema.json
│   ├── auth.schema.json
│   └── logic.schema.json
└── tests/
    └── test.js            # Unit tests

public/                    # Web dashboard
├── index.html
├── styles.css
└── script.js
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Temperature = 0 | Forces deterministic LLM output for consistency |
| 3-level repair | Avoids expensive full retries; fixes at the cheapest level possible |
| Stage-gated pipeline | Each stage validates before passing to next — catches errors early |
| Mock fallback | Full system demo without API key — proves architecture works independently of LLM |
| Cross-layer checks | Ensures API fields match DB columns, UI maps to API, auth covers routes |
| Execution simulation | Proves output is directly usable — not just "looks right" |

## License

MIT
