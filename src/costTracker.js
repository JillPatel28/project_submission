/**
 * Cost Tracker — Captures per-stage metrics for quality/cost tradeoff analysis.
 * 
 * Tracks: token usage, latency, retry counts, and computes composite quality scores.
 * This is the "instrumentation layer" of the compiler — every stage is measured.
 */
export class CostTracker {
  constructor() {
    this.stages = [];
    this.startTime = Date.now();
  }

  /**
   * Record metrics for a single pipeline stage.
   */
  addStage(name, { inputTokens = 0, outputTokens = 0, latencyMs = 0, attempts = 1, success = true } = {}) {
    this.stages.push({
      name,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      latencyMs,
      attempts,
      success,
      timestamp: Date.now(),
    });
  }

  getSummary() {
    const totalInputTokens = this.stages.reduce((s, st) => s + st.inputTokens, 0);
    const totalOutputTokens = this.stages.reduce((s, st) => s + st.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const totalLatency = this.stages.reduce((s, st) => s + st.latencyMs, 0);
    const totalAttempts = this.stages.reduce((s, st) => s + st.attempts, 0);
    const stageCount = this.stages.length;
    const avgLatencyMs = stageCount > 0 ? Math.round(totalLatency / stageCount) : 0;

    // Cost estimation: Gemini Flash pricing (approximate)
    const costPer1kInput = 0.000075;
    const costPer1kOutput = 0.0003;
    const estimatedCost = (totalInputTokens / 1000) * costPer1kInput + (totalOutputTokens / 1000) * costPer1kOutput;

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalLatency,
      totalAttempts,
      stageCount,
      avgLatencyMs,
      estimatedCost: Math.round(estimatedCost * 1000000) / 1000000,
      wallClockMs: Date.now() - this.startTime,
    };
  }

  computeQuality() {
    const totalAttempts = this.stages.reduce((s, st) => s + st.attempts, 0);
    const stagesWithRetries = this.stages.filter(s => s.attempts > 1).length;
    const firstPassRate = this.stages.filter(s => s.attempts === 1).length / Math.max(this.stages.length, 1);
    const successRate = this.stages.filter(s => s.success).length / Math.max(this.stages.length, 1);

    return {
      totalAttempts,
      stagesWithRetries,
      firstPassRate: Math.round(firstPassRate * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  computeTradeoff() {
    const summary = this.getSummary();
    const quality = this.computeQuality();

    // Quality score: weighted combination of success and first-pass rate
    const qualityScore = (quality.successRate * 0.6) + (quality.firstPassRate * 0.4);
    // Efficiency: quality per dollar (higher = better)
    const costEfficiency = summary.estimatedCost > 0
      ? Math.round((qualityScore / summary.estimatedCost) * 100) / 100
      : Infinity;

    let verdict = 'optimal';
    if (qualityScore < 0.7) verdict = 'degraded';
    else if (qualityScore < 0.9) verdict = 'acceptable';
    else if (summary.totalLatency > 30000) verdict = 'slow-but-quality';

    return {
      qualityScore: Math.round(qualityScore * 100) / 100,
      costEfficiency,
      verdict,
      costPerQualityPoint: summary.estimatedCost > 0
        ? Math.round((summary.estimatedCost / qualityScore) * 1000000) / 1000000
        : 0,
    };
  }

  getReport() {
    return {
      stages: this.stages,
      summary: this.getSummary(),
      qualityMetrics: this.computeQuality(),
      tradeoff: this.computeTradeoff(),
    };
  }
}
