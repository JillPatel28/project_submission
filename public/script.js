/**
 * Dashboard Script — Controls the compiler UI.
 * Handles: prompt submission, pipeline animation, schema display, trace rendering.
 */

document.addEventListener('DOMContentLoaded', () => {
  const compileBtn = document.getElementById('compile-btn');
  const promptInput = document.getElementById('prompt-input');
  const resultsSection = document.getElementById('results-section');
  const stageNodes = document.querySelectorAll('.stage-node');

  let currentData = null;

  // ── Compile Button ──
  compileBtn.addEventListener('click', () => runCompilation());
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runCompilation();
    }
  });

  async function runCompilation() {
    const prompt = promptInput.value.trim();
    if (!prompt || prompt.length < 3) return;

    compileBtn.disabled = true;
    compileBtn.classList.add('loading');
    compileBtn.textContent = 'Compiling';
    resultsSection.classList.remove('visible');

    // Animate pipeline stages
    resetStages();
    animateStage(0);

    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      currentData = data;

      // Complete all stages
      if (data.success) {
        for (let i = 0; i <= 5; i++) {
          stageNodes[i].classList.remove('active');
          stageNodes[i].classList.add('complete');
        }
      }

      renderResults(data);
      resultsSection.classList.add('visible');
    } catch (error) {
      console.error('Compilation error:', error);
      renderError(error.message);
      resultsSection.classList.add('visible');
    } finally {
      compileBtn.disabled = false;
      compileBtn.classList.remove('loading');
      compileBtn.textContent = 'Compile →';
    }
  }

  function resetStages() {
    stageNodes.forEach(node => {
      node.classList.remove('active', 'complete', 'error');
    });
  }

  function animateStage(index) {
    if (index >= stageNodes.length) return;
    stageNodes[index].classList.add('active');
    if (index > 0) {
      stageNodes[index - 1].classList.remove('active');
      stageNodes[index - 1].classList.add('complete');
    }
    setTimeout(() => animateStage(index + 1), 300);
  }

  // ── Render Results ──
  function renderResults(data) {
    if (!data) return;

    // Metrics
    const m = data.metrics?.summary || {};
    const q = data.metrics?.tradeoff || {};
    setText('m-latency', `${m.wallClockMs || 0}ms`);
    setText('m-tokens', (m.totalTokens || 0).toLocaleString());
    setText('m-cost', `$${(m.estimatedCost || 0).toFixed(5)}`);
    setText('m-quality', q.verdict || '—');
    setText('m-consistency', data.consistency?.isConsistent ? '100%' : `${Math.round((data.consistency?.score || 0) * 100)}%`);

    const execEl = document.getElementById('m-executable');
    if (data.execution?.isExecutable) {
      execEl.textContent = 'Verified';
      execEl.style.color = 'var(--green)';
    } else {
      execEl.textContent = 'Issues';
      execEl.style.color = 'var(--amber)';
    }

    const repairCount = data.metrics?.qualityMetrics?.stagesWithRetries || 0;
    const repairEl = document.getElementById('m-repairs');
    repairEl.textContent = repairCount > 0 ? `${repairCount} fixed` : 'None';
    repairEl.style.color = repairCount > 0 ? 'var(--amber)' : 'var(--green)';

    // Assumptions
    const assumptionsPanel = document.getElementById('assumptions-panel');
    const assumptionsList = document.getElementById('assumptions-list');
    if (data.analysis?.assumptions?.length > 0) {
      assumptionsList.innerHTML = data.analysis.assumptions.map(a =>
        `<div class="assumption-item"><span class="assumption-field">${a.field}:</span> ${a.assumed} — ${a.reason}</div>`
      ).join('');
      assumptionsPanel.classList.add('visible');
    } else {
      assumptionsPanel.classList.remove('visible');
    }

    // Architecture cards
    renderArchCards(data.design);

    // Schema tabs — default to UI
    renderSchema('ui', data);

    // Trace
    renderTrace(data.pipelineLog || []);
  }

  // ── Schema Tab Switching ──
  const schemaTabs = document.querySelectorAll('#schema-tabs .tab');
  schemaTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      schemaTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const layer = tab.dataset.layer;
      if (currentData) renderSchema(layer, currentData);
    });
  });

  function renderSchema(layer, data) {
    const titleEl = document.getElementById('schema-title');
    const badgeEl = document.getElementById('schema-badge');
    const outputEl = document.getElementById('schema-output');

    const titles = {
      ui: 'UI Configuration', api: 'API Configuration', db: 'Database Schema',
      auth: 'Auth Rules', logic: 'Business Logic', design: 'System Architecture',
      full: 'Full Pipeline Output',
    };
    titleEl.textContent = titles[layer] || layer;

    let jsonData;
    if (layer === 'full') {
      jsonData = data;
      badgeEl.textContent = data.success ? '✓ Pipeline Success' : '✗ Failed';
    } else if (layer === 'design') {
      jsonData = data.design;
      badgeEl.textContent = jsonData ? '✓ Valid' : '✗ Missing';
    } else {
      jsonData = data.schemas?.[layer];
      badgeEl.textContent = jsonData ? '✓ Valid' : '✗ Missing';
    }

    badgeEl.className = `schema-badge ${jsonData ? 'valid' : 'warning'}`;
    outputEl.innerHTML = jsonData ? syntaxHighlight(JSON.stringify(jsonData, null, 2)) : '<span class="json-null">No data generated for this layer.</span>';
  }

  function syntaxHighlight(json) {
    return json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
      .replace(/: "((?:[^"\\]|\\.)*)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/: (\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/: (null)/g, ': <span class="json-null">$1</span>');
  }

  // ── Architecture Cards ──
  function renderArchCards(design) {
    const grid = document.getElementById('arch-grid');
    if (!design?.entities) {
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = design.entities.map(entity => `
      <div class="arch-card">
        <div class="arch-card-title">🔷 ${entity.name}</div>
        <div class="arch-card-fields">
          ${(entity.fields || []).map(f => `<span class="field-tag">${f.name || f}: ${f.type || 'string'}</span>`).join('')}
        </div>
      </div>
    `).join('');

    // Add flows
    if (design.flows) {
      grid.innerHTML += design.flows.map(flow => `
        <div class="arch-card">
          <div class="arch-card-title">🔄 ${flow.name}</div>
          <div class="arch-card-fields">
            ${flow.steps.map(s => `<span class="field-tag">${s}</span>`).join('')}
          </div>
        </div>
      `).join('');
    }
  }

  // ── Pipeline Trace ──
  function renderTrace(log) {
    const traceBody = document.getElementById('trace-body');
    traceBody.innerHTML = log.map(line => {
      let cls = '';
      if (line.startsWith('═══')) cls = 'stage';
      else if (line.includes('✅')) cls = 'success';
      else if (line.includes('⚠️')) cls = 'warning';
      else if (line.includes('❌')) cls = 'error';
      else if (line.includes('📝') || line.includes('🚀') || line.includes('🔧')) cls = 'info';
      return `<div class="trace-line ${cls}">${line}</div>`;
    }).join('');
    traceBody.scrollTop = traceBody.scrollHeight;
  }

  function renderError(message) {
    const outputEl = document.getElementById('schema-output');
    outputEl.innerHTML = `<span class="json-null">Error: ${message}</span>`;
    document.getElementById('trace-body').innerHTML = `<div class="trace-line error">❌ ${message}</div>`;
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Health Check ──
  fetch('/api/health').then(r => r.json()).then(h => {
    document.getElementById('mode-label').textContent = `${h.mode === 'live' ? 'Live' : 'Mock'} Mode — ${h.stages} Stages`;
  }).catch(() => {
    document.getElementById('mode-label').textContent = 'Offline';
  });
});
