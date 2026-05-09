/**
 * CLI Entry Point
 * 
 * Usage: node src/index.js "Build a task management app with teams"
 * If no prompt provided, uses a default demo prompt.
 */
import { compileApp } from './pipeline/compiler.js';
import { validateConfig } from './config.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, '..', 'output');

async function main() {
  const prompt = process.argv[2] || 'Build a task management application for teams to organize and track work with user authentication, dashboards, and role-based access control.';

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║          AI Application Compiler Pipeline               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const { mode, warnings } = validateConfig();
  warnings.forEach(w => console.log(`⚠️  ${w}`));
  console.log(`🔧 Mode: ${mode.toUpperCase()}`);
  console.log(`📝 Prompt: "${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}"\n`);

  const startTime = Date.now();
  const result = await compileApp(prompt);

  // Print pipeline log
  console.log('┌─── Pipeline Trace ───────────────────────────────────┐');
  for (const line of result.pipelineLog) {
    console.log(`│  ${line}`);
  }
  console.log('└──────────────────────────────────────────────────────┘\n');

  // Print summary
  console.log('┌─── Result Summary ────────────────────────────────────┐');
  if (result.success) {
    console.log(`│  ✅ Pipeline completed successfully`);
    console.log(`│  📊 App: ${result.intent.appName} (${result.intent.appType})`);
    console.log(`│  🔢 Entities: ${result.intent.entities.join(', ')}`);
    console.log(`│  👥 Roles: ${result.intent.userRoles.join(', ')}`);
    console.log(`│  📄 Schemas: UI, API, DB, Auth, Logic`);
    console.log(`│  🔗 Consistency: ${result.consistency.isConsistent ? 'PASSED' : 'ISSUES'} (${result.consistency.score})`);
    console.log(`│  🚀 Executable: ${result.execution.isExecutable ? 'YES' : 'NO'} (${result.execution.score})`);
    console.log(`│  ⏱️  Total time: ${result.metrics.summary.wallClockMs}ms`);
    console.log(`│  💰 Est. cost: $${result.metrics.summary.estimatedCost}`);
    console.log(`│  🎯 Quality: ${result.metrics.tradeoff.verdict} (${result.metrics.tradeoff.qualityScore})`);
  } else {
    console.log(`│  ❌ Pipeline failed: ${result.error}`);
  }
  console.log('└──────────────────────────────────────────────────────┘\n');

  // Save output
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'pipeline-result.json'), JSON.stringify(result, null, 2));
  writeFileSync(join(outputDir, 'metrics.json'), JSON.stringify(result.metrics, null, 2));

  if (result.success) {
    const schemasDir = join(outputDir, 'schemas');
    if (!existsSync(schemasDir)) mkdirSync(schemasDir, { recursive: true });
    for (const [layer, schema] of Object.entries(result.schemas)) {
      if (schema) writeFileSync(join(schemasDir, `${layer}.json`), JSON.stringify(schema, null, 2));
    }
    writeFileSync(join(outputDir, 'design.json'), JSON.stringify(result.design, null, 2));
  }

  console.log(`📁 Output saved to: ${outputDir}/`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
