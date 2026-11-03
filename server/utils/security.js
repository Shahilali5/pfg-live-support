/**
 * Security & Sanitization Utilities for PFG Live Support
 */
const path = require('path');

// Simple, reliable HTML entity escape to prevent XSS
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Whitelisted MIME types for secure attachments
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/json'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.txt',
  '.json'
]);

function isAllowedFile(filename, mimetype) {
  const ext = path.extname(filename || '').toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_TYPES.has(mimetype);
}

// In-memory sliding window rate limiter for WebSocket events
class SocketRateLimiter {
  constructor(maxPerWindow = 10, windowMs = 5000) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
    this.clients = new Map();

    // Periodic cleanup of stale client records (unref so timer doesn't keep node alive)
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, timestamps] of this.clients.entries()) {
        const filtered = timestamps.filter(t => now - t < this.windowMs);
        if (filtered.length === 0) {
          this.clients.delete(id);
        } else {
          this.clients.set(id, filtered);
        }
      }
    }, 60000);
    if (cleanupInterval.unref) cleanupInterval.unref();
  }

  isAllowed(clientId) {
    const now = Date.now();
    const timestamps = this.clients.get(clientId) || [];
    const recent = timestamps.filter(t => now - t < this.windowMs);

    if (recent.length >= this.maxPerWindow) {
      return false;
    }

    recent.push(now);
    this.clients.set(clientId, recent);
    return true;
  }

  cleanup(clientId) {
    this.clients.delete(clientId);
  }
}

module.exports = {
  sanitizeText,
  isAllowedFile,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  SocketRateLimiter
};
