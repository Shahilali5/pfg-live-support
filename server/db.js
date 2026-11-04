/**
 * Database Abstraction Layer for PFG Live Support
 * Supports PostgreSQL with transparent fallback to persistent JSON storage.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const { hashPassword } = require('./auth');

const DATA_DIR = path.join(__dirname, '..', 'data');
const JSON_DB_PATH = path.join(DATA_DIR, 'pfg_store.json');

class DatabaseService {
  constructor() {
    this.isPg = false;
    this.pgPool = null;
    this.memoryData = null;
  }

  async init() {
    const dbUrl = process.env.DATABASE_URL;

    if (dbUrl) {
      try {
        console.log('[DB] Connecting to PostgreSQL at', dbUrl.replace(/:[^:]*@/, ':****@'));
        this.pgPool = new Pool({
          connectionString: dbUrl,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        // Test connection
        await this.pgPool.query('SELECT 1');
        this.isPg = true;
        console.log('[DB] PostgreSQL connected successfully.');
        await this.migratePg();
        return;
      } catch (err) {
        console.warn('[DB] PostgreSQL connection failed. Falling back to local persistent JSON store.', err.message);
        this.isPg = false;
      }
    } else {
      console.log('[DB] No DATABASE_URL provided. Using local persistent JSON database.');
    }

    this.initJsonStore();
  }

  async migratePg() {
    const schemaFile = path.join(__dirname, '..', 'schema.sql');
    if (fs.existsSync(schemaFile)) {
      const sql = fs.readFileSync(schemaFile, 'utf8');
      await this.pgPool.query(sql);
      console.log('[DB] PostgreSQL schema verified/migrated.');
    }
  }

  initJsonStore() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(JSON_DB_PATH)) {
      try {
        const raw = fs.readFileSync(JSON_DB_PATH, 'utf8');
        this.memoryData = JSON.parse(raw);
      } catch (e) {
        console.error('[DB] Error parsing existing store. Initializing blank store.', e);
        this.memoryData = this.getDefaultStore();
      }
    } else {
      this.memoryData = this.getDefaultStore();
      this.saveJsonStore();
    }
    // Ensure default admin exists
    if (!this.memoryData.agents || !Array.isArray(this.memoryData.agents) || this.memoryData.agents.length === 0) {
      this.memoryData.agents = this.getDefaultStore().agents;
      this.saveJsonStore();
    } else {
      const hasAdmin = this.memoryData.agents.some(a => a.email && a.email.toLowerCase() === 'admin@pfg.com');
      if (!hasAdmin) {
        this.memoryData.agents.unshift(this.getDefaultStore().agents[0]);
        this.saveJsonStore();
      }
    }
    console.log('[DB] JSON database loaded. Conversations count:', this.memoryData.conversations.length);
  }

  getDefaultStore() {
    return {
      sites: [
        {
          site_id: 'pfg_gateway_default',
          name: 'PFG Live Support',
          domain: 'pfg-gateway.io',
          webhook_url: '',
          settings: {
            company_name: 'PFG Support',
            logo_url: '',
            tagline: 'Online • Typically replies instantly',
            brand_color: '#4F46E5',
            header_gradient: 'linear-gradient(135deg, #0A1128 0%, #1E1B4B 100%)',
            position: 'right', // 'right' or 'left'
            security_notice: 'Support Note: Never share confidential passwords, security keys, or OTPs.',
            welcome_title: '👋 Welcome to Live Support',
            welcome_subtitle: 'How can our team help you today? Choose a quick option below or chat with us directly.',
            quick_replies: [
              { label: '👋 General Inquiry', text: 'Hi! I have a question about your service.' },
              { label: '⚡ Product Demo & Pricing', text: 'Can you help me understand your features and pricing?' },
              { label: '🛠️ Technical Support', text: 'I need help with setup and technical troubleshooting.' },
              { label: '💬 Talk to an Agent', text: 'I would like to speak directly with a support agent.' }
            ],
            sound_enabled: true,
            operating_hours: '24/7',
            departments: ['General Support', 'Technical Support', 'Billing & Sales', 'Account Assistance']
          },
          created_at: new Date().toISOString()
        }
      ],
      agents: [
        {
          agent_id: 'agent_pfg_admin',
          name: 'Shahil Ali',
          email: 'admin@pfg.com',
          password_hash: hashPassword('admin123'),
          role: 'admin',
          department: 'Platform Engineering & Support',
          avatar: 'https://github.com/shahilali5.png',
          is_online: true,
          last_seen_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        },
        {
          agent_id: 'agent_pfg_tech',
          name: 'PFG Tech Support',
          email: 'tech@pfg.com',
          password_hash: hashPassword('admin123'),
          role: 'agent',
          department: 'Technical Support',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
          is_online: true,
          last_seen_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        }
      ],
      customers: [],
      conversations: [],
      messages: [],
      attachments: [],
      internal_notes: [],
      canned_responses: [
        {
          response_id: 'cr_1',
          shortcut: '#greeting',
          title: 'Welcome Greeting',
          text: 'Hello! Thank you for reaching out to PFG Support. My name is {{agent_name}}. How can our team assist you today?',
          department: 'All',
          created_at: new Date().toISOString()
        },
        {
          response_id: 'cr_2',
          shortcut: '#tx_lookup',
          title: 'Transaction Verification',
          text: 'To help resolve your issue faster, please provide your account email or reference details. Please remember: NEVER share confidential passwords, PINs, or secret keys.',
          department: 'Payments',
          created_at: new Date().toISOString()
        },
        {
          response_id: 'cr_3',
          shortcut: '#webhook',
          title: 'Webhook Debugging',
          text: 'For webhook notifications, ensure your endpoint responds with HTTP 200 within 5 seconds. You can verify payload signatures using your Merchant Secret Key in the PFG Developer Console.',
          department: 'Technical Support',
          created_at: new Date().toISOString()
        },
        {
          response_id: 'cr_4',
          shortcut: '#refund',
          title: 'Refund Processing Time',
          text: 'Standard refunds take 3 to 5 business days to credit back to the original source bank/card, depending on the issuing bank network.',
          department: 'Payments',
          created_at: new Date().toISOString()
        },
        {
          response_id: 'cr_5',
          shortcut: '#resolved',
          title: 'Issue Resolved Closing',
          text: 'I have marked this issue as resolved. Feel free to leave a quick rating below. Thank you for reaching out to PFG Live Support!',
          department: 'All',
          created_at: new Date().toISOString()
        }
      ],
      chat_events: []
    };
  }

  saveJsonStore() {
    if (this.isPg) return;
    try {
      fs.writeFileSync(JSON_DB_PATH, JSON.stringify(this.memoryData, null, 2), 'utf8');
    } catch (err) {
      console.error('[DB] Failed to persist JSON database:', err);
    }
  }

  // --- SITES & SETTINGS ---
  async getSite(siteId) {
    if (this.isPg) {
      const res = await this.pgPool.query('SELECT * FROM sites WHERE site_id = $1', [siteId]);
      return res.rows[0] || null;
    }
    return this.memoryData.sites.find(s => s.site_id === siteId) || null;
  }

  async getSiteSettings(siteId = 'pfg_gateway_default') {
    const site = await this.getSite(siteId);
    if (!site) {
      return this.getDefaultStore().sites[0].settings;
    }
    if (typeof site.settings === 'string') {
      try {
        return JSON.parse(site.settings);
      } catch (e) {
        return site.settings;
      }
    }
    return site.settings || this.getDefaultStore().sites[0].settings;
  }

  async updateSiteSettings(siteId, newSettings) {
    const current = await this.getSiteSettings(siteId);
    const merged = { ...current, ...newSettings };

    if (this.isPg) {
      await this.pgPool.query(
        'UPDATE sites SET settings = $1 WHERE site_id = $2',
        [JSON.stringify(merged), siteId]
      );
      return merged;
    }

    let site = this.memoryData.sites.find(s => s.site_id === siteId);
    if (!site) {
      site = {
        site_id: siteId,
        name: newSettings.company_name || 'PFG Payment Gateway',
        settings: merged,
        created_at: new Date().toISOString()
      };
      this.memoryData.sites.push(site);
    } else {
      site.settings = merged;
    }
    this.saveJsonStore();
    return merged;
  }

  // --- AGENTS ---
  async getAgentByEmail(email) {
    if (this.isPg) {
      const res = await this.pgPool.query('SELECT * FROM agents WHERE LOWER(email) = LOWER($1)', [email]);
      return res.rows[0] || null;
    }
    const clean = String(email || '').trim().toLowerCase();
    return (this.memoryData.agents || []).find(a => a.email && a.email.trim().toLowerCase() === clean) || null;
  }

  async getAgentById(agentId) {
    if (this.isPg) {
      const res = await this.pgPool.query('SELECT * FROM agents WHERE agent_id = $1', [agentId]);
      return res.rows[0] || null;
    }
    return this.memoryData.agents.find(a => a.agent_id === agentId) || null;
  }

  async getAllAgents() {
    if (this.isPg) {
      const res = await this.pgPool.query('SELECT agent_id, name, email, role, department, avatar, is_online, last_seen_at FROM agents ORDER BY name ASC');
      return res.rows;
    }
    return this.memoryData.agents.map(a => {
      const { password_hash, ...rest } = a;
      return rest;
    });
  }

  async updateAgentStatus(agentId, isOnline) {
    const lastSeen = new Date().toISOString();
    if (this.isPg) {
      await this.pgPool.query('UPDATE agents SET is_online = $1, last_seen_at = $2 WHERE agent_id = $3', [isOnline, lastSeen, agentId]);
      return;
    }
    const agent = this.memoryData.agents.find(a => a.agent_id === agentId);
    if (agent) {
      agent.is_online = isOnline;
      agent.last_seen_at = lastSeen;
      this.saveJsonStore();
    }
  }

  // --- CUSTOMERS ---
  async createCustomer({ siteId, sessionToken, name = 'Guest Customer', email = null, ip = null, userAgent = null, metadata = {} }) {
    const customer = {
      customer_id: 'cust_' + uuidv4().slice(0, 12),
      site_id: siteId,
      session_token: sessionToken,
      name,
      email,
      ip_address: ip,
      user_agent: userAgent,
      metadata,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString()
    };

    if (this.isPg) {
      await this.pgPool.query(
        `INSERT INTO customers (customer_id, site_id, session_token, name, email, ip_address, user_agent, metadata, created_at, last_active_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [customer.customer_id, customer.site_id, customer.session_token, customer.name, customer.email, customer.ip_address, customer.user_agent, JSON.stringify(customer.metadata), customer.created_at, customer.last_active_at]
      );
      return customer;
    }

    this.memoryData.customers.push(customer);
    this.saveJsonStore();
    return customer;
  }

  async getCustomerByToken(sessionToken) {
    if (this.isPg) {
      const res = await this.pgPool.query('SELECT * FROM customers WHERE session_token = $1', [sessionToken]);
      return res.rows[0] || null;
    }
    return this.memoryData.customers.find(c => c.session_token === sessionToken) || null;
  }

  async getCustomerById(customerId) {
    if (this.isPg) {
      const res = await this.pgPool.query('SELECT * FROM customers WHERE customer_id = $1', [customerId]);
      return res.rows[0] || null;
    }
    return this.memoryData.customers.find(c => c.customer_id === customerId) || null;
  }

  async updateCustomer(customerId, fields = {}) {
    fields.last_active_at = new Date().toISOString();
    if (this.isPg) {
      const keys = Object.keys(fields);
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const values = keys.map(k => typeof fields[k] === 'object' && fields[k] !== null ? JSON.stringify(fields[k]) : fields[k]);
      await this.pgPool.query(`UPDATE customers SET ${setClause} WHERE customer_id = $1`, [customerId, ...values]);
      return this.getCustomerById(customerId);
    }
    const customer = this.memoryData.customers.find(c => c.customer_id === customerId);
    if (customer) {
      Object.assign(customer, fields);
      this.saveJsonStore();
    }
    return customer;
  }

  // --- CONVERSATIONS ---
  async createConversation({ siteId, customerId, department = 'Payments', assignedAgentId = null }) {
    const conversation = {
      conversation_id: 'conv_' + uuidv4().slice(0, 12),
      site_id: siteId,
      customer_id: customerId,
      assigned_agent_id: assignedAgentId,
      status: 'open', // open, pending, resolved
      department,
      rating: null,
      feedback: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (this.isPg) {
      await this.pgPool.query(
        `INSERT INTO conversations (conversation_id, site_id, customer_id, assigned_agent_id, status, department, rating, feedback, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [conversation.conversation_id, conversation.site_id, conversation.customer_id, conversation.assigned_agent_id, conversation.status, conversation.department, conversation.rating, conversation.feedback, conversation.created_at, conversation.updated_at]
      );
      return conversation;
    }

    this.memoryData.conversations.push(conversation);
    this.saveJsonStore();
    return conversation;
  }

  async getConversation(conversationId) {
    if (this.isPg) {
      const res = await this.pgPool.query(
        `SELECT c.*, cust.name as customer_name, cust.email as customer_email, cust.ip_address, cust.user_agent, cust.metadata as customer_metadata,
                ag.name as agent_name, ag.avatar as agent_avatar
         FROM conversations c
         LEFT JOIN customers cust ON c.customer_id = cust.customer_id
         LEFT JOIN agents ag ON c.assigned_agent_id = ag.agent_id
         WHERE c.conversation_id = $1`,
        [conversationId]
      );
      return res.rows[0] || null;
    }

    const c = this.memoryData.conversations.find(conv => conv.conversation_id === conversationId);
    if (!c) return null;
    const cust = this.memoryData.customers.find(cu => cu.customer_id === c.customer_id) || {};
    const agent = this.memoryData.agents.find(a => a.agent_id === c.assigned_agent_id) || {};
    return {
      ...c,
      customer_name: cust.name,
      customer_email: cust.email,
      ip_address: cust.ip_address,
      user_agent: cust.user_agent,
      customer_metadata: cust.metadata,
      agent_name: agent.name,
      agent_avatar: agent.avatar
    };
  }

  async getActiveConversationForCustomer(customerId) {
    if (this.isPg) {
      const res = await this.pgPool.query(
        `SELECT * FROM conversations
         WHERE customer_id = $1 AND status != 'resolved'
         ORDER BY updated_at DESC LIMIT 1`,
        [customerId]
      );
      return res.rows[0] || null;
    }
    const convs = this.memoryData.conversations.filter(c => c.customer_id === customerId && c.status !== 'resolved');
    convs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return convs[0] || null;
  }

  async getConversations({ siteId, status, department, search } = {}) {
    let list = [];
    if (this.isPg) {
      let query = `
        SELECT c.*,
               cust.name as customer_name, cust.email as customer_email, cust.ip_address,
               ag.name as agent_name,
               (SELECT text FROM messages m WHERE m.conversation_id = c.conversation_id AND m.is_internal = false ORDER BY m.created_at DESC LIMIT 1) as last_message_text,
               (SELECT created_at FROM messages m WHERE m.conversation_id = c.conversation_id AND m.is_internal = false ORDER BY m.created_at DESC LIMIT 1) as last_message_time,
               (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.conversation_id AND m.sender_type = 'customer' AND m.status != 'seen') as unread_count
        FROM conversations c
        LEFT JOIN customers cust ON c.customer_id = cust.customer_id
        LEFT JOIN agents ag ON c.assigned_agent_id = ag.agent_id
        WHERE 1=1
      `;
      const params = [];
      if (siteId) {
        params.push(siteId);
        query += ` AND c.site_id = $${params.length}`;
      }
      if (status && status !== 'all') {
        params.push(status);
        query += ` AND c.status = $${params.length}`;
      }
      if (department && department !== 'all') {
        params.push(department);
        query += ` AND c.department = $${params.length}`;
      }
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        query += ` AND (LOWER(cust.name) LIKE $${params.length} OR LOWER(cust.email) LIKE $${params.length} OR c.conversation_id LIKE $${params.length})`;
      }
      query += ` ORDER BY c.updated_at DESC`;

      const res = await this.pgPool.query(query, params);
      return res.rows;
    }

    list = this.memoryData.conversations.map(c => {
      const cust = this.memoryData.customers.find(cu => cu.customer_id === c.customer_id) || {};
      const agent = this.memoryData.agents.find(a => a.agent_id === c.assigned_agent_id) || {};
      const convMsgs = this.memoryData.messages
        .filter(m => m.conversation_id === c.conversation_id && !m.is_internal)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const lastMsg = convMsgs[convMsgs.length - 1];
      const unreadCount = convMsgs.filter(m => m.sender_type === 'customer' && m.status !== 'seen').length;

      return {
        ...c,
        customer_name: cust.name,
        customer_email: cust.email,
        ip_address: cust.ip_address,
        agent_name: agent.name,
        last_message_text: lastMsg ? lastMsg.text : '',
        last_message_time: lastMsg ? lastMsg.created_at : c.created_at,
        unread_count: unreadCount
      };
    });

    if (siteId) list = list.filter(c => c.site_id === siteId);
    if (status && status !== 'all') list = list.filter(c => c.status === status);
    if (department && department !== 'all') list = list.filter(c => c.department === department);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
        (c.customer_email && c.customer_email.toLowerCase().includes(q)) ||
        c.conversation_id.includes(q) ||
        (c.last_message_text && c.last_message_text.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return list;
  }

  async updateConversation(conversationId, fields = {}) {
    fields.updated_at = new Date().toISOString();
    if (this.isPg) {
      const keys = Object.keys(fields);
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      await this.pgPool.query(`UPDATE conversations SET ${setClause} WHERE conversation_id = $1`, [conversationId, ...Object.values(fields)]);
      return this.getConversation(conversationId);
    }

    const c = this.memoryData.conversations.find(conv => conv.conversation_id === conversationId);
    if (c) {
      Object.assign(c, fields);
      this.saveJsonStore();
    }
    return this.getConversation(conversationId);
  }

  // --- MESSAGES ---
  async addMessage({
    conversationId,
    senderType,
    senderId,
    senderName,
    text,
    status = 'sent',
    isInternal = false,
    clientMsgId = null,
    attachment = null
  }) {
    // Deduplication check scoped to conversation
    if (clientMsgId) {
      const existing = await this.getMessageByClientId(conversationId, clientMsgId);
      if (existing) return existing;
    }

    const message = {
      message_id: 'msg_' + uuidv4().slice(0, 14),
      conversation_id: conversationId,
      sender_type: senderType, // 'customer', 'agent', 'system'
      sender_id: senderId,
      sender_name: senderName,
      text,
      status, // 'sent', 'delivered', 'seen'
      is_internal: isInternal,
      client_msg_id: clientMsgId,
      created_at: new Date().toISOString(),
      attachments: []
    };

    if (this.isPg) {
      await this.pgPool.query(
        `INSERT INTO messages (message_id, conversation_id, sender_type, sender_id, sender_name, text, status, is_internal, client_msg_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [message.message_id, message.conversation_id, message.sender_type, message.sender_id, message.sender_name, message.text, message.status, message.is_internal, message.client_msg_id, message.created_at]
      );

      // Update conversation updated_at
      await this.pgPool.query('UPDATE conversations SET updated_at = $1 WHERE conversation_id = $2', [message.created_at, conversationId]);

      if (attachment) {
        const att = await this.addAttachment({
          messageId: message.message_id,
          ...attachment
        });
        message.attachments.push(att);
      }

      return message;
    }

    this.memoryData.messages.push(message);

    // Update conversation timestamp
    const conv = this.memoryData.conversations.find(c => c.conversation_id === conversationId);
    if (conv) {
      conv.updated_at = message.created_at;
    }

    if (attachment) {
      const att = await this.addAttachment({
        messageId: message.message_id,
        ...attachment
      });
      message.attachments.push(att);
    }

    this.saveJsonStore();
    return message;
  }

  async getMessageByClientId(conversationId, clientMsgId) {
    if (!clientMsgId) return null;
    if (this.isPg) {
      const res = await this.pgPool.query('SELECT * FROM messages WHERE conversation_id = $1 AND client_msg_id = $2', [conversationId, clientMsgId]);
      return res.rows[0] || null;
    }
    return this.memoryData.messages.find(m => m.conversation_id === conversationId && m.client_msg_id === clientMsgId) || null;
  }

  async getMessages(conversationId, { includeInternal = false } = {}) {
    if (this.isPg) {
      let query = `
        SELECT m.*,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'attachment_id', a.attachment_id,
                     'file_name', a.file_name,
                     'file_url', a.file_url,
                     'file_size', a.file_size,
                     'mime_type', a.mime_type
                   )
                 ) FILTER (WHERE a.attachment_id IS NOT NULL), '[]'
               ) as attachments
        FROM messages m
        LEFT JOIN attachments a ON m.message_id = a.message_id
        WHERE m.conversation_id = $1
      `;
      if (!includeInternal) {
        query += ` AND m.is_internal = false`;
      }
      query += ` GROUP BY m.message_id ORDER BY m.created_at ASC`;

      const res = await this.pgPool.query(query, [conversationId]);
      return res.rows;
    }

    let msgs = this.memoryData.messages.filter(m => m.conversation_id === conversationId);
    if (!includeInternal) {
      msgs = msgs.filter(m => !m.is_internal);
    }

    // Attach attachments
    const result = msgs.map(m => {
      const atts = this.memoryData.attachments.filter(a => a.message_id === m.message_id);
      return {
        ...m,
        attachments: atts
      };
    });

    result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return result;
  }

  async updateMessageStatus(messageId, status) {
    if (this.isPg) {
      await this.pgPool.query('UPDATE messages SET status = $1 WHERE message_id = $2', [status, messageId]);
      return;
    }
    const msg = this.memoryData.messages.find(m => m.message_id === messageId);
    if (msg) {
      msg.status = status;
      this.saveJsonStore();
    }
  }

  async markConversationMessagesSeen(conversationId, readerType) {
    // If agent reads, mark customer messages seen. If customer reads, mark agent messages seen.
    const targetSenderType = readerType === 'agent' ? 'customer' : 'agent';
    if (this.isPg) {
      await this.pgPool.query(
        `UPDATE messages SET status = 'seen'
         WHERE conversation_id = $1 AND sender_type = $2 AND status != 'seen'`,
        [conversationId, targetSenderType]
      );
      return;
    }
    let updated = false;
    this.memoryData.messages.forEach(m => {
      if (m.conversation_id === conversationId && m.sender_type === targetSenderType && m.status !== 'seen') {
        m.status = 'seen';
        updated = true;
      }
    });
    if (updated) this.saveJsonStore();
  }

  // --- ATTACHMENTS ---
  async addAttachment({ messageId, fileName, fileUrl, fileSize, mimeType }) {
    const attachment = {
      attachment_id: 'att_' + uuidv4().slice(0, 12),
      message_id: messageId,
      file_name: fileName,
      file_url: fileUrl,
      file_size: fileSize,
      mime_type: mimeType,
      created_at: new Date().toISOString()
    };

    if (this.isPg) {
      await this.pgPool.query(
        `INSERT INTO attachments (attachment_id, message_id, file_name, file_url, file_size, mime_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [attachment.attachment_id, attachment.message_id, attachment.file_name, attachment.file_url, attachment.file_size, attachment.mime_type, attachment.created_at]
      );
      return attachment;
    }

    this.memoryData.attachments.push(attachment);
    this.saveJsonStore();
    return attachment;
  }

  // --- INTERNAL NOTES ---
  async addInternalNote({ conversationId, agentId, agentName, noteText }) {
    const note = {
      note_id: 'note_' + uuidv4().slice(0, 12),
      conversation_id: conversationId,
      agent_id: agentId,
      agent_name: agentName,
      note_text: noteText,
      created_at: new Date().toISOString()
    };

    if (this.isPg) {
      await this.pgPool.query(
        `INSERT INTO internal_notes (note_id, conversation_id, agent_id, agent_name, note_text, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [note.note_id, note.conversation_id, note.agent_id, note.agent_name, note.note_text, note.created_at]
      );
      return note;
    }

    this.memoryData.internal_notes.push(note);
    this.saveJsonStore();
    return note;
  }

  async getInternalNotes(conversationId) {
    if (this.isPg) {
      const res = await this.pgPool.query(
        'SELECT * FROM internal_notes WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
      );
      return res.rows;
    }
    return this.memoryData.internal_notes
      .filter(n => n.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  // --- CANNED RESPONSES ---
  async getCannedResponses(department = null) {
    if (this.isPg) {
      let query = 'SELECT * FROM canned_responses WHERE 1=1';
      const params = [];
      if (department && department !== 'All') {
        params.push(department);
        query += ` AND (department = 'All' OR department = $1)`;
      }
      query += ' ORDER BY shortcut ASC';
      const res = await this.pgPool.query(query, params);
      return res.rows;
    }

    return this.memoryData.canned_responses.filter(c => {
      if (!department || department === 'All') return true;
      return c.department === 'All' || c.department === department;
    });
  }

  // --- ANALYTICS ---
  async getAnalytics(siteId = 'pfg_gateway_default') {
    if (this.isPg) {
      const totalRes = await this.pgPool.query('SELECT COUNT(*)::int as total FROM conversations WHERE site_id = $1', [siteId]);
      const openRes = await this.pgPool.query("SELECT COUNT(*)::int as open FROM conversations WHERE site_id = $1 AND status = 'open'", [siteId]);
      const resolvedRes = await this.pgPool.query("SELECT COUNT(*)::int as resolved FROM conversations WHERE site_id = $1 AND status = 'resolved'", [siteId]);
      const ratingRes = await this.pgPool.query('SELECT AVG(rating)::numeric(2,1) as avg_rating FROM conversations WHERE site_id = $1 AND rating IS NOT NULL', [siteId]);

      return {
        totalConversations: totalRes.rows[0].total,
        openConversations: openRes.rows[0].open,
        resolvedConversations: resolvedRes.rows[0].resolved,
        avgRating: parseFloat(ratingRes.rows[0].avg_rating) || 4.9,
        avgResponseTime: '< 1 min'
      };
    }

    const convs = this.memoryData.conversations.filter(c => !siteId || c.site_id === siteId);
    const total = convs.length;
    const open = convs.filter(c => c.status === 'open').length;
    const resolved = convs.filter(c => c.status === 'resolved').length;
    const rated = convs.filter(c => typeof c.rating === 'number');
    const avgRating = rated.length > 0 ? (rated.reduce((sum, c) => sum + c.rating, 0) / rated.length).toFixed(1) : '5.0';

    return {
      totalConversations: total,
      openConversations: open,
      resolvedConversations: resolved,
      avgRating: Number(avgRating),
      avgResponseTime: '< 1 min'
    };
  }
}

const db = new DatabaseService();
module.exports = db;
