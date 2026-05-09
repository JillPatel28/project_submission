/**
 * Evaluation Framework
 * 
 * Runs the compiler against 20 diverse test cases and produces a formal metrics report.
 * 10 real product prompts + 10 edge cases (vague, conflicting, incomplete).
 * 
 * Tracks: success rate, retries per request, failure types, latency, consistency scores.
 */
import { compileApp } from './pipeline/compiler.js';
import { validateConfig } from './config.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 10 Real Product Prompts ──
const REAL_PROMPTS = [
  { id: 'crm', prompt: 'Build a CRM with login, contacts management, dashboard, role-based access, and premium plan with payments. Admins can see analytics.' },
  { id: 'task-manager', prompt: 'Build a task management application for teams to organize and track work with user authentication, dashboards, and role-based access control.' },
  { id: 'ecommerce', prompt: 'Create an e-commerce platform with product catalog, shopping cart, checkout with payments, order tracking, and admin dashboard for inventory management.' },
  { id: 'healthcare', prompt: 'Build a healthcare portal where patients can book appointments with doctors, view medical records, and receive prescriptions. Doctors manage their schedules.' },
  { id: 'lms', prompt: 'Create a learning management system with courses, lessons, quizzes, student progress tracking, and instructor dashboard with analytics.' },
  { id: 'social-media', prompt: 'Build a social media platform with user profiles, posts, comments, likes, follow system, and a news feed algorithm.' },
  { id: 'project-mgmt', prompt: 'Build a project management tool like Jira with projects, tasks, sprints, team members, kanban boards, and reporting.' },
  { id: 'booking-system', prompt: 'Create a restaurant booking system with table management, reservations, menu display, reviews, and admin analytics dashboard.' },
  { id: 'hr-platform', prompt: 'Build an HR management platform with employee profiles, leave management, payroll tracking, department hierarchy, and performance reviews.' },
  { id: 'support-desk', prompt: 'Create a customer support ticket system with ticket creation, assignment, priority levels, SLA tracking, knowledge base, and agent dashboard.' },
];

// ── 10 Edge Case Prompts ──
const EDGE_CASES = [
  { id: 'vague-minimal', prompt: 'build app', type: 'vague' },
  { id: 'vague-generic', prompt: 'I want a website', type: 'vague' },
  { id: 'vague-abstract', prompt: 'Make something useful for my business', type: 'vague' },
  { id: 'conflicting-simple-complex', prompt: 'Build a simple basic app with advanced enterprise features, AI-powered analytics, and microservices architecture', type: 'conflicting' },
  { id: 'conflicting-free-paid', prompt: 'Build a free app with no costs that has premium subscriptions and payment processing', type: 'conflicting' },
  { id: 'incomplete-no-features', prompt: 'Build a notes app', type: 'incomplete' },
  { id: 'incomplete-technical', prompt: 'Build a REST API with PostgreSQL', type: 'incomplete' },
  { id: 'overloaded', prompt: 'Build an app that does everything: CRM, e-commerce, social media, project management, healthcare records, restaurant bookings, HR management, and machine learning predictions all in one', type: 'overloaded' },
  { id: 'nonsensical', prompt: 'Build me a purple elephant that dances with quantum computing and blockchain in the metaverse', type: 'nonsensical' },
  { id: 'single-word', prompt: 'calculator', type: 'vague' },
];

async function runEvaluation() {
  console.log('\n══════ AI Compiler Evaluation Framework ══════\n');

  const { mode, warnings } = validateConfig();
  warnings.forEach(w => console.log(`⚠️  ${w}`));
  console.log(`Mode: ${mode.toUpperCase()} | Test Cases: ${REAL_PROMPTS.length + EDGE_CASES.length}\n`);

  const results = [];

  // Run real prompts
  console.log('── Real Product Prompts ──\n');
  for (const test of REAL_PROMPTS) {
    const result = await runSingleTest(test);
    results.push(result);
  }

  // Run edge cases
  console.log('\n── Edge Cases ──\n');
  for (const test of EDGE_CASES) {
    const result = await runSingleTest(test);
    results.push(result);
  }

  // Compute aggregate metrics
  const report = computeReport(results);

  console.log('\n══════ Evaluation Summary ══════\n');
  console.log(`Total Tests:        ${report.totalTests}`);
  console.log(`Success Rate:       ${(report.successRate * 100).toFixed(1)}%`);
  console.log(`Avg Latency:        ${report.avgLatencyMs}ms`);
  console.log(`Avg Retries:        ${report.avgRetries}`);
  console.log(`Avg Consistency:    ${(report.avgConsistency * 100).toFixed(1)}%`);
  console.log(`Avg Exec Score:     ${(report.avgExecScore * 100).toFixed(1)}%`);
  console.log(`Avg Quality:        ${(report.avgQuality * 100).toFixed(1)}%`);
  console.log(`\nReal Prompt Success: ${(report.realSuccess * 100).toFixed(1)}%`);
  console.log(`Edge Case Success:  ${(report.edgeSuccess * 100).toFixed(1)}%`);

  console.log('\nFailure Breakdown:');
  for (const [type, count] of Object.entries(report.failureTypes)) {
    console.log(`  ${type}: ${count}`);
  }

  // Save report
  const outputDir = join(__dirname, '..', 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'evaluation-report.json'), JSON.stringify({ report, results }, null, 2));
  console.log(`\n📁 Full report saved to: output/evaluation-report.json`);
}

async function runSingleTest(test) {
  const start = Date.now();
  try {
    const result = await compileApp(test.prompt);
    const latency = Date.now() - start;

    const score = computeTestScore(result);
    const icon = result.success ? '✅' : '⚠️';
    console.log(`  ${icon} ${test.id.padEnd(25)} | Score: ${score.toFixed(2)} | ${latency}ms | Retries: ${result.metrics?.qualityMetrics?.totalAttempts || 0}`);

    return {
      id: test.id,
      type: test.type || 'real',
      success: result.success,
      score,
      latencyMs: latency,
      retries: result.metrics?.qualityMetrics?.totalAttempts || 0,
      consistency: result.consistency?.score || 0,
      execScore: result.execution?.score || 0,
      quality: result.metrics?.tradeoff?.qualityScore || 0,
      failureType: result.success ? null : (result.error || 'unknown'),
    };
  } catch (error) {
    const latency = Date.now() - start;
    console.log(`  ❌ ${test.id.padEnd(25)} | Error: ${error.message} | ${latency}ms`);
    return {
      id: test.id,
      type: test.type || 'real',
      success: false,
      score: 0,
      latencyMs: latency,
      retries: 0,
      consistency: 0,
      execScore: 0,
      quality: 0,
      failureType: error.message,
    };
  }
}

function computeTestScore(result) {
  if (!result.success) return 0;

  const weights = {
    pipelineSuccess: 0.2,
    schemaCompleteness: 0.2,
    consistency: 0.2,
    execScore: 0.2,
    quality: 0.2,
  };

  const schemaCount = Object.values(result.schemas || {}).filter(Boolean).length;
  const completeness = schemaCount / 5;

  return (
    (result.success ? 1 : 0) * weights.pipelineSuccess +
    completeness * weights.schemaCompleteness +
    (result.consistency?.score || 0) * weights.consistency +
    (result.execution?.score || 0) * weights.execScore +
    (result.metrics?.tradeoff?.qualityScore || 0) * weights.quality
  );
}

function computeReport(results) {
  const total = results.length;
  const successes = results.filter(r => r.success);
  const realResults = results.filter(r => r.type === 'real');
  const edgeResults = results.filter(r => r.type !== 'real');

  const failureTypes = {};
  results.filter(r => !r.success).forEach(r => {
    const type = r.failureType || 'unknown';
    failureTypes[type] = (failureTypes[type] || 0) + 1;
  });

  return {
    totalTests: total,
    successRate: successes.length / total,
    avgLatencyMs: Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / total),
    avgRetries: Math.round((results.reduce((s, r) => s + r.retries, 0) / total) * 100) / 100,
    avgConsistency: Math.round((results.reduce((s, r) => s + r.consistency, 0) / total) * 100) / 100,
    avgExecScore: Math.round((results.reduce((s, r) => s + r.execScore, 0) / total) * 100) / 100,
    avgQuality: Math.round((results.reduce((s, r) => s + r.quality, 0) / total) * 100) / 100,
    realSuccess: realResults.filter(r => r.success).length / realResults.length,
    edgeSuccess: edgeResults.filter(r => r.success).length / edgeResults.length,
    failureTypes,
  };
}

runEvaluation().catch(err => {
  console.error('Evaluation error:', err);
  process.exit(1);
});
