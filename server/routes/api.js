/**
 * REST API Routes for PFG Live Support
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const db = require('../db');
const { requireAgentAuth, generateCustomerSessionToken } = require('../auth');
const { isAllowedFile, sanitizeText } = require('../utils/security');

// Ensure uploads folder exists
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `pfg_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (isAllowedFile(file.originalname, file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: JPG, PNG, WEBP, GIF, PDF, TXT, JSON.'));
    }
  }
});

// =========================================================================
// PUBLIC CONFIGURATION & WHITE-LABEL ENDPOINTS
// =========================================================================

// Public config for customer widget (no auth required)
router.get('/public/config', async (req, res) => {
  try {
    const siteId = req.query.siteId || 'pfg_gateway_default';
    const settings = await db.getSiteSettings(siteId);
    res.json({
      success: true,
      siteId,
      config: {
        company_name: settings.company_name || 'PFG Support',
        logo_url: settings.logo_url || '',
        tagline: settings.tagline || 'Online • Typically replies instantly',
        brand_color: settings.brand_color || '#4F46E5',
        header_gradient: settings.header_gradient || 'linear-gradient(135deg, #0A1128 0%, #1E1B4B 100%)',
        position: settings.position || 'right',
        security_notice: settings.security_notice || 'PFG Security Note: We will never ask for your UPI PIN, OTP, CVV, or passwords.',
        welcome_title: settings.welcome_title || '👋 Welcome to Live Support',
        welcome_subtitle: settings.welcome_subtitle || 'Need help with your payment, webhook, API credentials or refund? Choose a quick option or write to us directly.',
        quick_replies: settings.quick_replies || [],
        sound_enabled: settings.sound_enabled !== false,
        departments: settings.departments || ['Payments', 'Technical Support', 'Account Support', 'General']
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// CUSTOMER ENDPOINTS
// =========================================================================

// Initialize or resume customer session & active conversation
router.post('/customer/session', async (req, res) => {
  try {
    const { siteId = 'pfg_gateway_default', sessionToken, name, email, metadata = {} } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    let customer = null;
    if (sessionToken) {
      customer = await db.getCustomerByToken(sessionToken);
    }

    if (!customer) {
      const newToken = generateCustomerSessionToken();
      customer = await db.createCustomer({
        siteId,
        sessionToken: newToken,
        name: sanitizeText(name) || 'Guest Customer',
        email: sanitizeText(email) || null,
        ip,
        userAgent,
        metadata
      });
    } else {
      // Update customer info if provided
      const updates = {};
      if (name && name !== customer.name) updates.name = sanitizeText(name);
      if (email && email !== customer.email) updates.email = sanitizeText(email);
      if (metadata && Object.keys(metadata).length > 0) updates.metadata = metadata;
      if (Object.keys(updates).length > 0) {
        customer = await db.updateCustomer(customer.customer_id, updates);
      }
    }

    // Get or create active conversation
    let conversation = await db.getActiveConversationForCustomer(customer.customer_id);
    if (!conversation) {
      conversation = await db.createConversation({
        siteId,
        customerId: customer.customer_id,
        department: metadata.department || 'Payments'
      });
    }

    const messages = await db.getMessages(conversation.conversation_id, { includeInternal: false });

    res.json({
      success: true,
      customer: {
        customerId: customer.customer_id,
        sessionToken: customer.session_token,
        name: customer.name,
        email: customer.email
      },
      conversation: {
        conversationId: conversation.conversation_id,
        status: conversation.status,
        department: conversation.department,
        assignedAgentId: conversation.assigned_agent_id
      },
      messages
    });
  } catch (err) {
    console.error('[API] Customer session error:', err);
    res.status(500).json({ success: false, error: 'Failed to initialize session' });
  }
});

// Customer Conversation History
router.get('/customer/conversation/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { sessionToken } = req.query;

    if (!sessionToken) {
      return res.status(401).json({ success: false, error: 'Session token required' });
    }

    const customer = await db.getCustomerByToken(sessionToken);
    const conv = await db.getConversation(conversationId);

    if (!customer || !conv || conv.customer_id !== customer.customer_id) {
      return res.status(403).json({ success: false, error: 'Unauthorized access to conversation' });
    }

    const messages = await db.getMessages(conversationId, { includeInternal: false });
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Customer Rating / Feedback
router.post('/customer/conversation/:conversationId/rating', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { sessionToken, rating, feedback } = req.body;

    const customer = await db.getCustomerByToken(sessionToken);
    const conv = await db.getConversation(conversationId);

    if (!customer || !conv || conv.customer_id !== customer.customer_id) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const numRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
    const safeFeedback = sanitizeText(feedback || '');

    const updated = await db.updateConversation(conversationId, {
      rating: numRating,
      feedback: safeFeedback,
      status: 'resolved'
    });

    res.json({ success: true, conversation: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// FILE UPLOAD (Customer & Agent)
// =========================================================================
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File size exceeds maximum limit (10MB)' });
      }
      return res.status(400).json({ success: false, error: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      file: {
        fileName: req.file.originalname,
        fileUrl,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      }
    });
  });
});

// =========================================================================
// ADMIN ENDPOINTS (Agent Protected)
// =========================================================================

// List Conversations
router.get('/admin/conversations', requireAgentAuth, async (req, res) => {
  try {
    const { siteId, status, department, search } = req.query;
    const list = await db.getConversations({ siteId, status, department, search });
    res.json({ success: true, conversations: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single Conversation Details (including internal notes)
router.get('/admin/conversation/:conversationId', requireAgentAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = await db.getConversation(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const messages = await db.getMessages(conversationId, { includeInternal: true });
    const notes = await db.getInternalNotes(conversationId);

    res.json({
      success: true,
      conversation,
      messages,
      notes
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Conversation Status (open / pending / resolved)
router.post('/admin/conversation/:conversationId/status', requireAgentAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { status } = req.body;
    if (!['open', 'pending', 'resolved'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const updated = await db.updateConversation(conversationId, { status });

    // Add a system audit message
    await db.addMessage({
      conversationId,
      senderType: 'system',
      senderId: req.agent.agent_id,
      senderName: 'PFG System',
      text: `Conversation status changed to "${status.toUpperCase()}" by ${req.agent.name}.`
    });

    res.json({ success: true, conversation: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Assign Agent
router.post('/admin/conversation/:conversationId/assign', requireAgentAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { agentId } = req.body;

    const assignedAgent = agentId ? await db.getAgentById(agentId) : null;
    const updated = await db.updateConversation(conversationId, {
      assigned_agent_id: agentId || null
    });

    const agentName = assignedAgent ? assignedAgent.name : 'Unassigned';
    await db.addMessage({
      conversationId,
      senderType: 'system',
      senderId: req.agent.agent_id,
      senderName: 'PFG System',
      text: `Conversation assigned to ${agentName}.`
    });

    res.json({ success: true, conversation: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add Internal Note
router.post('/admin/conversation/:conversationId/notes', requireAgentAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { noteText } = req.body;
    if (!noteText || !noteText.trim()) {
      return res.status(400).json({ success: false, error: 'Note text cannot be empty' });
    }

    const note = await db.addInternalNote({
      conversationId,
      agentId: req.agent.agent_id,
      agentName: req.agent.name,
      noteText: sanitizeText(noteText.trim())
    });

    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List Agents
router.get('/admin/agents', requireAgentAuth, async (req, res) => {
  try {
    const agents = await db.getAllAgents();
    res.json({ success: true, agents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List Canned Responses
router.get('/admin/canned-responses', requireAgentAuth, async (req, res) => {
  try {
    const { department } = req.query;
    const responses = await db.getCannedResponses(department);
    res.json({ success: true, cannedResponses: responses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dashboard Analytics
router.get('/admin/analytics', requireAgentAuth, async (req, res) => {
  try {
    const { siteId } = req.query;
    const stats = await db.getAnalytics(siteId);
    res.json({ success: true, analytics: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export Chat Transcript (JSON or TXT)
router.get('/admin/conversation/:conversationId/export', requireAgentAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { format = 'txt' } = req.query;

    const conv = await db.getConversation(conversationId);
    if (!conv) return res.status(404).send('Conversation not found');

    const messages = await db.getMessages(conversationId, { includeInternal: true });

    if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="transcript_${conversationId}.json"`);
      return res.json({ conversation: conv, messages });
    }

    // Text format
    let text = `=================================================\n`;
    text += `PFG LIVE SUPPORT TRANSCRIPT: ${conv.conversation_id}\n`;
    text += `Customer: ${conv.customer_name || 'Guest'} (${conv.customer_email || 'No email'})\n`;
    text += `Site: ${conv.site_id} | Status: ${conv.status} | Dept: ${conv.department}\n`;
    text += `Started: ${conv.created_at}\n`;
    text += `=================================================\n\n`;

    messages.forEach(m => {
      const time = new Date(m.created_at).toLocaleTimeString();
      const internalTag = m.is_internal ? '[INTERNAL NOTE] ' : '';
      text += `[${time}] ${internalTag}${m.sender_name || m.sender_type.toUpperCase()}: ${m.text}\n`;
      if (m.attachments && m.attachments.length > 0) {
        m.attachments.forEach(att => {
          text += `       -> Attachment: ${att.file_name} (${att.file_url})\n`;
        });
      }
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transcript_${conversationId}.txt"`);
    res.send(text);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Site Settings (Admin)
router.get('/admin/settings', requireAgentAuth, async (req, res) => {
  try {
    const siteId = req.query.siteId || 'pfg_gateway_default';
    const settings = await db.getSiteSettings(siteId);
    res.json({ success: true, siteId, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Site Settings (Admin White-label Customization)
router.put('/admin/settings', requireAgentAuth, async (req, res) => {
  try {
    const siteId = req.body.siteId || 'pfg_gateway_default';
    const rawSettings = req.body.settings || {};

    // Validate & sanitize customizable fields
    const sanitized = {};
    if (typeof rawSettings.company_name === 'string') sanitized.company_name = sanitizeText(rawSettings.company_name);
    if (typeof rawSettings.logo_url === 'string') sanitized.logo_url = sanitizeText(rawSettings.logo_url);
    if (typeof rawSettings.tagline === 'string') sanitized.tagline = sanitizeText(rawSettings.tagline);
    if (typeof rawSettings.brand_color === 'string') sanitized.brand_color = sanitizeText(rawSettings.brand_color);
    if (typeof rawSettings.header_gradient === 'string') sanitized.header_gradient = sanitizeText(rawSettings.header_gradient);
    if (rawSettings.position === 'left' || rawSettings.position === 'right') sanitized.position = rawSettings.position;
    if (typeof rawSettings.security_notice === 'string') sanitized.security_notice = sanitizeText(rawSettings.security_notice);
    if (typeof rawSettings.welcome_title === 'string') sanitized.welcome_title = sanitizeText(rawSettings.welcome_title);
    if (typeof rawSettings.welcome_subtitle === 'string') sanitized.welcome_subtitle = sanitizeText(rawSettings.welcome_subtitle);
    if (Array.isArray(rawSettings.quick_replies)) {
      sanitized.quick_replies = rawSettings.quick_replies.map(qr => ({
        label: sanitizeText(qr.label || ''),
        text: sanitizeText(qr.text || '')
      })).filter(qr => qr.label && qr.text);
    }
    if (Array.isArray(rawSettings.departments)) {
      sanitized.departments = rawSettings.departments.map(d => sanitizeText(d)).filter(Boolean);
    }
    if (typeof rawSettings.sound_enabled === 'boolean') sanitized.sound_enabled = rawSettings.sound_enabled;

    const updated = await db.updateSiteSettings(siteId, sanitized);

    // Real-time broadcast to all connected sockets
    if (req.io) {
      req.io.emit('settings:updated', { siteId, settings: updated });
    }

    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
