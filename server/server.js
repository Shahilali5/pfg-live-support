/**
 * PFG Live Support - Server Entry Point
 * Real-time Customer Support System for Payment Gateways & SaaS
 */
require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const db = require('./db');
const { setupWebSocket } = require('./socket');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);

const PORT = parseInt(process.env.PORT, 10) || 3000;

// Socket.IO Server configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  transports: ['websocket', 'polling']
});

// Pass IO instance to request context if needed
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// General HTTP rate limiting
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again shortly.' }
});
app.use('/api/', generalLimiter);

// Static Asset Directories
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Admin dashboard routes (mounted before express.static to avoid unnecessary redirect)
app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html'));
});

// Developer API Documentation
app.get(['/docs', '/docs/'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'docs', 'index.html'));
});

// Root demo merchant portal
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'demo', 'index.html'));
});

// Direct convenient static routes & aliases to prevent 404s under any reverse-proxy or path configuration
app.get(['/widget.js', '/public/widget.js'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'widget.js'));
});

app.get(['/widget.css', '/public/widget.css'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'widget.css'));
});

app.get(['/admin.css', '/admin/admin.css'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'admin.css'));
});

app.get(['/admin.js', '/admin/admin.js'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'admin.js'));
});

app.get(['/demo.css', '/demo/demo.css'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'demo', 'demo.css'));
});

app.get(['/docs.css', '/docs/docs.css'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'docs', 'docs.css'));
});

app.use(express.static(PUBLIC_DIR));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// 404 Handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Server Initialization
async function startServer() {
  try {
    console.log('--------------------------------------------------');
    console.log('🚀 Initializing PFG Live Support System...');
    console.log('--------------------------------------------------');

    await db.init();
    setupWebSocket(io);

    server.listen(PORT, () => {
      console.log(`✅ PFG Live Support is live on: http://localhost:${PORT}`);
      console.log(`💬 Merchant Demo Portal:        http://localhost:${PORT}/`);
      console.log(`🛡️  Admin Support Console:       http://localhost:${PORT}/admin`);
      console.log(`📚 API & WebSocket Docs:        http://localhost:${PORT}/docs`);
      console.log(`📦 Embeddable Widget:          http://localhost:${PORT}/widget.js`);
      console.log('--------------------------------------------------');
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

module.exports = { app, server, io };
