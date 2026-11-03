/**
 * WebSocket Lifecycle and Real-time Communication Controller
 * PFG Live Support
 */
const { verifyAgentToken } = require('./auth');
const db = require('./db');
const { sanitizeText, SocketRateLimiter } = require('./utils/security');

const rateLimiter = new SocketRateLimiter(
  parseInt(process.env.SOCKET_RATE_LIMIT_MAX, 10) || 12,
  parseInt(process.env.SOCKET_RATE_LIMIT_WINDOW_MS, 10) || 5000
);

// Track online connections
const activeCustomerSockets = new Map(); // customer_id -> Set of socketIds
const activeAgentSockets = new Map();    // agent_id -> Set of socketIds

function setupWebSocket(io) {
  // Authentication & Handshake Middleware
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      const query = socket.handshake.query || {};

      const token = auth.token || query.token;
      const sessionToken = auth.sessionToken || query.sessionToken;
      const role = auth.role || query.role; // 'agent' or 'customer'

      if (role === 'agent') {
        if (!token) {
          return next(new Error('Authentication required for agent socket'));
        }
        const decoded = verifyAgentToken(token);
        if (!decoded) {
          return next(new Error('Invalid agent token'));
        }
        socket.userType = 'agent';
        socket.agent = decoded;
        return next();
      }

      // Customer connection
      if (sessionToken) {
        const customer = await db.getCustomerByToken(sessionToken);
        if (customer) {
          socket.userType = 'customer';
          socket.customer = customer;
          socket.siteId = customer.site_id;
          return next();
        }
      }

      // Anonymous / initial customer connecting before session creation
      socket.userType = 'guest';
      return next();
    } catch (err) {
      console.error('[SOCKET] Middleware error:', err.message);
      return next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const clientId = socket.userType === 'agent'
      ? `agent_${socket.agent.agent_id}`
      : socket.userType === 'customer'
        ? `cust_${socket.customer.customer_id}`
        : `guest_${socket.id}`;

    console.log(`[SOCKET] Connected: ${clientId} (${socket.id})`);

    // Handle Agent Connection
    if (socket.userType === 'agent') {
      const agentId = socket.agent.agent_id;
      if (!activeAgentSockets.has(agentId)) {
        activeAgentSockets.set(agentId, new Set());
      }
      activeAgentSockets.get(agentId).add(socket.id);

      // Join site-wide agent broadcast room
      const siteId = socket.handshake.auth?.siteId || 'pfg_gateway_default';
      socket.join(`agents_${siteId}`);
      socket.join(`agent_${agentId}`);

      // Broadcast agent online presence
      db.updateAgentStatus(agentId, true).catch(console.error);
      io.emit('agent:presence', { agent_id: agentId, is_online: true });
    }

    // Handle Customer Connection
    if (socket.userType === 'customer') {
      const customerId = socket.customer.customer_id;
      if (!activeCustomerSockets.has(customerId)) {
        activeCustomerSockets.set(customerId, new Set());
      }
      activeCustomerSockets.get(customerId).add(socket.id);

      // Notify agents that customer is online
      io.to(`agents_${socket.siteId}`).emit('customer:presence', {
        customer_id: customerId,
        is_online: true
      });
    }

    // =========================================================================
    // ROOM JOINING & SUBSCRIPTION
    // =========================================================================

    // Customer joins their own conversation room
    socket.on('customer:join_conversation', async ({ conversationId, sessionToken }, callback) => {
      try {
        const conv = await db.getConversation(conversationId);
        if (!conv) {
          if (callback) callback({ success: false, error: 'Conversation not found' });
          return;
        }

        // Validate customer ownership
        if (socket.userType === 'customer') {
          if (conv.customer_id !== socket.customer.customer_id) {
            if (callback) callback({ success: false, error: 'Unauthorized room access' });
            return;
          }
        } else if (sessionToken) {
          const customer = await db.getCustomerByToken(sessionToken);
          if (!customer || conv.customer_id !== customer.customer_id) {
            if (callback) callback({ success: false, error: 'Unauthorized' });
            return;
          }
          socket.userType = 'customer';
          socket.customer = customer;
        }

        socket.join(`conv_${conversationId}`);
        socket.currentConversationId = conversationId;

        // Check if any agent is currently active/online
        const hasOnlineAgents = activeAgentSockets.size > 0;

        if (callback) {
          callback({
            success: true,
            conversation: conv,
            agentsOnline: hasOnlineAgents
          });
        }
      } catch (err) {
        console.error('[SOCKET] Join error:', err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    // Agent joins specific conversation room to monitor/reply
    socket.on('agent:join_conversation', async ({ conversationId }, callback) => {
      if (socket.userType !== 'agent') {
        if (callback) callback({ success: false, error: 'Unauthorized' });
        return;
      }

      socket.join(`conv_${conversationId}`);
      socket.currentConversationId = conversationId;

      // Mark unread customer messages as seen
      await db.markConversationMessagesSeen(conversationId, 'agent');
      io.to(`conv_${conversationId}`).emit('messages:seen', {
        conversation_id: conversationId,
        seen_by: 'agent'
      });

      if (callback) callback({ success: true });
    });

    // =========================================================================
    // REAL-TIME MESSAGING
    // =========================================================================

    // Send Message Event
    socket.on('message:send', async (payload, callback) => {
      try {
        if (!rateLimiter.isAllowed(socket.id)) {
          if (callback) callback({ success: false, error: 'Rate limit exceeded. Please slow down.' });
          return;
        }

        const {
          conversationId,
          text,
          clientMsgId,
          attachment = null,
          isInternal = false
        } = payload;

        if (!conversationId || (!text && !attachment)) {
          if (callback) callback({ success: false, error: 'Message content is required.' });
          return;
        }

        const conv = await db.getConversation(conversationId);
        if (!conv) {
          if (callback) callback({ success: false, error: 'Conversation does not exist.' });
          return;
        }

        let senderType = 'customer';
        let senderId = socket.id;
        let senderName = 'Customer';

        if (socket.userType === 'agent') {
          senderType = 'agent';
          senderId = socket.agent.agent_id;
          senderName = socket.agent.name;
        } else if (socket.userType === 'customer') {
          senderType = 'customer';
          senderId = socket.customer.customer_id;
          senderName = socket.customer.name;

          // Prevent customers from setting isInternal
          if (isInternal) {
            if (callback) callback({ success: false, error: 'Customers cannot create internal notes.' });
            return;
          }
        }

        const cleanText = sanitizeText(text || '');

        // Persist message to database
        const message = await db.addMessage({
          conversationId,
          senderType,
          senderId,
          senderName,
          text: cleanText,
          status: 'sent',
          isInternal: Boolean(isInternal),
          clientMsgId,
          attachment
        });

        // Broadcast to appropriate rooms
        if (isInternal) {
          // Internal notes are only sent to agents viewing this conversation
          io.to(`conv_${conversationId}`).emit('internal_note:new', {
            conversationId,
            note: message
          });
        } else {
          // Standard customer/agent message
          io.to(`conv_${conversationId}`).emit('message:new', {
            conversationId,
            message
          });

          // Also alert all agents for this site so their inbox preview and unread counters update
          io.to(`agents_${conv.site_id}`).emit('inbox:conversation_updated', {
            conversationId,
            lastMessage: message,
            senderType,
            customerName: conv.customer_name
          });
        }

        if (callback) callback({ success: true, message });
      } catch (err) {
        console.error('[SOCKET] Send message error:', err);
        if (callback) callback({ success: false, error: 'Server failed to send message.' });
      }
    });

    // =========================================================================
    // TYPING INDICATORS
    // =========================================================================

    socket.on('typing:start', ({ conversationId }) => {
      if (!conversationId) return;
      const room = `conv_${conversationId}`;
      if (socket.userType === 'agent') {
        socket.to(room).emit('agent:typing', {
          conversationId,
          agentName: socket.agent.name,
          isTyping: true
        });
      } else {
        socket.to(room).emit('customer:typing', {
          conversationId,
          isTyping: true
        });
      }
    });

    socket.on('typing:stop', ({ conversationId }) => {
      if (!conversationId) return;
      const room = `conv_${conversationId}`;
      if (socket.userType === 'agent') {
        socket.to(room).emit('agent:typing', {
          conversationId,
          isTyping: false
        });
      } else {
        socket.to(room).emit('customer:typing', {
          conversationId,
          isTyping: false
        });
      }
    });

    // =========================================================================
    // READ RECEIPTS & DELIVERY CONFIRMATION
    // =========================================================================

    socket.on('message:delivered', async ({ messageId, conversationId }) => {
      if (!messageId) return;
      await db.updateMessageStatus(messageId, 'delivered');
      io.to(`conv_${conversationId}`).emit('message:status_update', {
        messageId,
        status: 'delivered'
      });
    });

    socket.on('conversation:seen', async ({ conversationId }) => {
      if (!conversationId) return;
      const readerType = socket.userType === 'agent' ? 'agent' : 'customer';
      await db.markConversationMessagesSeen(conversationId, readerType);
      io.to(`conv_${conversationId}`).emit('messages:seen', {
        conversationId,
        seenBy: readerType
      });
    });

    // =========================================================================
    // DISCONNECTION & CLEANUP
    // =========================================================================

    socket.on('disconnect', () => {
      rateLimiter.cleanup(socket.id);

      if (socket.userType === 'agent') {
        const agentId = socket.agent.agent_id;
        const set = activeAgentSockets.get(agentId);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) {
            activeAgentSockets.delete(agentId);
            db.updateAgentStatus(agentId, false).catch(console.error);
            io.emit('agent:presence', { agent_id: agentId, is_online: false });
          }
        }
      }

      if (socket.userType === 'customer' && socket.customer) {
        const customerId = socket.customer.customer_id;
        const set = activeCustomerSockets.get(customerId);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) {
            activeCustomerSockets.delete(customerId);
            io.to(`agents_${socket.siteId}`).emit('customer:presence', {
              customer_id: customerId,
              is_online: false
            });
          }
        }
      }

      console.log(`[SOCKET] Disconnected: ${clientId}`);
    });
  });
}

module.exports = {
  setupWebSocket
};
