/**
 * Express API Server — Compiler Dashboard
 * 
 * Serves the web UI and exposes the compiler pipeline as a REST API.
 * Handles CORS, error recovery, and graceful port fallback.
 */
import express from 'express';
import { compileApp } from './pipeline/compiler.js';
import { CONFIG, validateConfig } from './config.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// API: Compile endpoint
app.post('/api/compile', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
    return res.status(400).json({ success: false, error: 'Prompt is required (min 3 characters)' });
  }

  try {
    const result = await compileApp(prompt.trim());
    res.json(result);
  } catch (error) {
    console.error('Compilation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Health check
app.get('/api/health', (req, res) => {
  const { mode } = validateConfig();
  res.json({ status: 'ok', mode, stages: CONFIG.pipeline.stages.length });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// Graceful port fallback
const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`\n🌐 Compiler Dashboard running at: http://localhost:${port}`);
    console.log(`🚀 Mode: ${validateConfig().mode.toUpperCase()}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  Port ${port} busy, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      throw err;
    }
  });
};

// Start server locally, but export for Vercel Serverless
if (process.env.NODE_ENV !== 'production') {
  startServer(CONFIG.server.port);
}

export default app;
