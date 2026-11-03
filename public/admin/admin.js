/**
 * PFG Live Support - Admin Support Console Client
 */
(function () {
  'use strict';

  // State
  const state = {
    token: localStorage.getItem('pfg_agent_token') || null,
    agent: null,
    socket: null,
    conversations: [],
    currentConversationId: null,
    currentConversation: null,
    cannedResponses: [],
    agents: [],
    activeFilter: 'all',
    activeDept: 'all',
    searchQuery: '',
    composerMode: 'reply', // 'reply' | 'note'
    selectedAttachment: null,
    audioCtx: null,
    activeView: 'inbox',
    siteSettings: {
      company_name: 'PFG Support',
      logo_url: '',
      tagline: 'Online • Typically replies instantly',
      brand_color: '#4F46E5',
      header_gradient: 'linear-gradient(135deg, #0A1128 0%, #1E1B4B 100%)',
      position: 'right',
      security_notice: 'PFG Security Note: We will never ask for your UPI PIN, OTP, CVV, or passwords.',
      welcome_title: '👋 Welcome to Live Support',
      welcome_subtitle: 'Need help with your payment, webhook, API credentials or refund? Choose a quick option or write to us directly.',
      quick_replies: []
    }
  };

  // Synthesized notification chime
  function playAgentChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!state.audioCtx) state.audioCtx = new AudioContext();
      if (state.audioCtx.state === 'suspended') state.audioCtx.resume();

      const now = state.audioCtx.currentTime;
      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(state.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }

  // --- API Helper ---
  async function apiFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (state.token) {
      options.headers['Authorization'] = `Bearer ${state.token}`;
    }
    if (!(options.body instanceof FormData) && !options.headers['Content-Type']) {
      options.headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, options);
    if (res.status === 401) {
      handleLogout();
      throw new Error('Session expired');
    }
    return res.json();
  }

  // --- Bootstrap & Auth ---
  async function checkAuth() {
    if (!state.token) {
      showLogin();
      return;
    }

    try {
      const data = await apiFetch('/api/auth/me');
      if (data.success && data.agent) {
        state.agent = data.agent;
        showDashboard();
      } else {
        showLogin();
      }
    } catch (e) {
      showLogin();
    }
  }

  function showLogin() {
    document.getElementById('loginView').style.display = 'flex';
    document.getElementById('dashboardView').style.display = 'none';
  }

  function showDashboard() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'flex';

    // Populate Agent Profile
    document.getElementById('agentName').textContent = state.agent.name;
    document.getElementById('agentRole').textContent = `${state.agent.department} • ${state.agent.role.toUpperCase()}`;
    const avatarEl = document.getElementById('agentAvatar');
    if (state.agent.avatar) {
      avatarEl.innerHTML = `<img src="${state.agent.avatar}" alt="${state.agent.name}" style="width:100%;height:100%;border-radius:10px;object-fit:cover;">`;
    } else {
      const initials = state.agent.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      avatarEl.textContent = initials;
    }

    // Connect WebSocket
    connectSocket();

    // Load Initial Data
    loadAnalytics();
    loadAgents();
    loadCannedResponses();
    loadConversations();
  }

  function handleLogout() {
    localStorage.removeItem('pfg_agent_token');
    state.token = null;
    state.agent = null;
    if (state.socket) state.socket.disconnect();
    window.location.reload();
  }

  // --- Socket.IO Real-time Connection ---
  function connectSocket() {
    if (!window.io || !state.token) return;

    state.socket = window.io('/', {
      auth: {
        role: 'agent',
        token: state.token
      }
    });

    state.socket.on('connect', () => {
      console.log('[AGENT SOCKET] Connected');
    });

    // Real-time inbox update from any customer
    state.socket.on('inbox:conversation_updated', ({ conversationId, lastMessage, senderType, customerName }) => {
      playAgentChime();
      loadConversations();
      loadAnalytics();

      // If active conversation, also reload or append
      if (state.currentConversationId === conversationId && senderType === 'customer') {
        state.socket.emit('agent:join_conversation', { conversationId });
      }
    });

    // New message in active conversation
    state.socket.on('message:new', ({ conversationId, message }) => {
      if (conversationId === state.currentConversationId) {
        renderMessageItem(message);
        scrollToChatBottom();

        // Mark as seen immediately
        if (message.sender_type === 'customer') {
          state.socket.emit('conversation:seen', { conversationId });
        }
      }
    });

    // New internal note
    state.socket.on('internal_note:new', ({ conversationId, note }) => {
      if (conversationId === state.currentConversationId) {
        renderMessageItem(note, true);
        scrollToChatBottom();
      }
    });

    // Customer typing indicator
    state.socket.on('customer:typing', ({ conversationId, isTyping }) => {
      if (conversationId === state.currentConversationId) {
        const bar = document.getElementById('customerTypingBar');
        bar.style.display = isTyping ? 'flex' : 'none';
      }
    });

    // Customer presence
    state.socket.on('customer:presence', ({ customer_id, is_online }) => {
      const dot = document.querySelector(`[data-customer-dot="${customer_id}"]`);
      if (dot) {
        dot.className = `presence-dot ${is_online ? '' : 'offline'}`;
      }
    });

    // Counterparty seen receipt
    state.socket.on('messages:seen', ({ conversationId, seenBy }) => {
      if (conversationId === state.currentConversationId && seenBy === 'customer') {
        document.querySelectorAll('.msg-receipt').forEach(r => {
          r.innerHTML = renderDoubleCheck();
          r.classList.add('seen');
        });
      }
    });
  }

  // --- Load Data via REST ---
  async function loadAnalytics() {
    try {
      const data = await apiFetch('/api/admin/analytics');
      if (data.success && data.analytics) {
        document.getElementById('kpiOpen').textContent = data.analytics.openConversations;
        document.getElementById('kpiAvgTime').textContent = data.analytics.avgResponseTime;
        document.getElementById('kpiRating').textContent = `${data.analytics.avgRating} ★`;
      }
    } catch (e) {}
  }

  async function loadAgents() {
    try {
      const data = await apiFetch('/api/admin/agents');
      if (data.success && data.agents) {
        state.agents = data.agents;
        const select = document.getElementById('threadAssignSelect');
        select.innerHTML = '<option value="">Unassigned</option>';
        data.agents.forEach(a => {
          const opt = document.createElement('option');
          opt.value = a.agent_id;
          opt.textContent = `${a.name} (${a.department})`;
          select.appendChild(opt);
        });
      }
    } catch (e) {}
  }

  async function loadCannedResponses() {
    try {
      const data = await apiFetch('/api/admin/canned-responses');
      if (data.success && data.cannedResponses) {
        state.cannedResponses = data.cannedResponses;
        const select = document.getElementById('cannedResponseSelect');
        select.innerHTML = '<option value="">⚡ Canned Responses...</option>';
        data.cannedResponses.forEach(cr => {
          const opt = document.createElement('option');
          opt.value = cr.shortcut;
          opt.textContent = `${cr.shortcut} - ${cr.title}`;
          select.appendChild(opt);
        });
      }
    } catch (e) {}
  }

  async function loadConversations() {
    try {
      const params = new URLSearchParams();
      if (state.activeFilter !== 'all') params.set('status', state.activeFilter);
      if (state.activeDept !== 'all') params.set('department', state.activeDept);
      if (state.searchQuery) params.set('search', state.searchQuery);

      const data = await apiFetch(`/api/admin/conversations?${params.toString()}`);
      if (data.success && data.conversations) {
        state.conversations = data.conversations;
        renderConversationList();
      }
    } catch (e) {}
  }

  // --- Render Conversation List ---
  function renderConversationList() {
    const listEl = document.getElementById('conversationList');
    listEl.innerHTML = '';

    if (state.conversations.length === 0) {
      listEl.innerHTML = '<div class="empty-list">No conversations found.</div>';
      return;
    }

    state.conversations.forEach(conv => {
      const item = document.createElement('div');
      item.className = `conv-item ${conv.conversation_id === state.currentConversationId ? 'active' : ''}`;
      item.dataset.id = conv.conversation_id;

      const initials = (conv.customer_name || 'Customer').slice(0, 2).toUpperCase();
      const timeStr = conv.last_message_time ? formatTime(conv.last_message_time) : '';

      item.innerHTML = `
        <div class="conv-avatar-wrap">
          <span>${initials}</span>
          <span class="presence-dot" data-customer-dot="${conv.customer_id}"></span>
        </div>
        <div class="conv-body">
          <div class="conv-top-row">
            <span class="conv-name">${escapeHtml(conv.customer_name || 'Guest Customer')}</span>
            <span class="conv-time">${timeStr}</span>
          </div>
          <div class="conv-preview">${escapeHtml(conv.last_message_text || 'Started a new support conversation')}</div>
          <div class="conv-badges">
            <span class="status-badge ${conv.status}">${conv.status}</span>
            <span class="dept-badge">${conv.department}</span>
            ${conv.unread_count > 0 ? `<span class="unread-count-badge">${conv.unread_count}</span>` : ''}
          </div>
        </div>
      `;

      item.addEventListener('click', () => openConversation(conv.conversation_id));
      listEl.appendChild(item);
    });
  }

  // --- Open Active Conversation ---
  async function openConversation(conversationId) {
    state.currentConversationId = conversationId;

    // Highlight in list
    document.querySelectorAll('.conv-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === conversationId);
    });

    document.getElementById('noSelectionView').style.display = 'none';
    document.getElementById('activeChatView').style.display = 'flex';
    document.getElementById('rightDrawer').style.display = 'flex';

    // Clear composer
    document.getElementById('composerTextarea').value = '';
    clearSelectedAttachment();

    try {
      const data = await apiFetch(`/api/admin/conversation/${conversationId}`);
      if (data.success && data.conversation) {
        state.currentConversation = data.conversation;
        renderConversationDetails(data.conversation, data.messages, data.notes);

        // Join room on Socket.IO
        if (state.socket) {
          state.socket.emit('agent:join_conversation', { conversationId });
        }
      }
    } catch (e) {
      console.error('Failed to load conversation details:', e);
    }
  }

  // --- Render Thread Header & Messages ---
  function renderConversationDetails(conv, messages, notes) {
    // Header
    document.getElementById('threadCustomerName').textContent = conv.customer_name || 'Guest Customer';
    document.getElementById('threadCustomerId').textContent = conv.customer_id;
    document.getElementById('threadDepartment').textContent = conv.department;
    document.getElementById('threadSiteId').textContent = conv.site_id;

    document.getElementById('threadStatusSelect').value = conv.status;
    document.getElementById('threadAssignSelect').value = conv.assigned_agent_id || '';

    // Right Drawer Profile
    document.getElementById('profileName').textContent = conv.customer_name || 'Guest Customer';
    document.getElementById('profileEmail').textContent = conv.customer_email || 'No email provided';
    document.getElementById('profileInitials').textContent = (conv.customer_name || 'C').slice(0, 2).toUpperCase();
    document.getElementById('profileIp').textContent = conv.ip_address || '127.0.0.1';
    document.getElementById('profileUserAgent').textContent = conv.user_agent ? conv.user_agent.slice(0, 40) + '...' : 'Unknown';
    document.getElementById('profileSessionId').textContent = conv.customer_id;

    if (conv.customer_metadata && conv.customer_metadata.url) {
      document.getElementById('profilePageUrl').textContent = conv.customer_metadata.url;
    }

    // CSAT
    const csatSec = document.getElementById('csatSection');
    if (conv.rating) {
      csatSec.style.display = 'block';
      document.getElementById('profileCsat').textContent = '★'.repeat(conv.rating) + '☆'.repeat(5 - conv.rating) + ` (${conv.rating}/5)`;
      document.getElementById('profileFeedback').textContent = conv.feedback ? `"${conv.feedback}"` : 'No written feedback.';
    } else {
      csatSec.style.display = 'none';
    }

    // Render Internal Notes list in right drawer
    renderNotesList(notes);

    // Render Messages Stream
    const stream = document.getElementById('chatStream');
    stream.innerHTML = '';

    messages.forEach(msg => {
      renderMessageItem(msg);
    });

    scrollToChatBottom();
  }

  function renderNotesList(notes) {
    const listEl = document.getElementById('internalNotesList');
    listEl.innerHTML = '';
    if (!notes || notes.length === 0) {
      listEl.innerHTML = '<div class="empty-notes">No private notes yet.</div>';
      return;
    }
    notes.forEach(n => {
      const item = document.createElement('div');
      item.className = 'note-item';
      item.innerHTML = `
        <div class="note-meta">${escapeHtml(n.agent_name)} • ${formatTime(n.created_at)}</div>
        <div>${escapeHtml(n.note_text)}</div>
      `;
      listEl.appendChild(item);
    });
  }

  function renderMessageItem(msg, isForcedInternal = false) {
    const stream = document.getElementById('chatStream');

    if (msg.sender_type === 'system') {
      const sys = document.createElement('div');
      sys.className = 'system-msg-row';
      sys.textContent = msg.text;
      stream.appendChild(sys);
      return;
    }

    const isInternal = msg.is_internal || isForcedInternal;
    const isCustomer = msg.sender_type === 'customer';

    const row = document.createElement('div');
    row.className = `msg-row ${isInternal ? 'internal-note' : isCustomer ? 'customer' : 'agent'}`;

    let authorLabel = msg.sender_name || (isCustomer ? 'Customer' : 'Agent');
    if (isCustomer && state.currentConversation) {
      authorLabel = state.currentConversation.customer_name || 'Customer';
    }

    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach(att => {
        const isImg = att.mime_type && att.mime_type.startsWith('image/');
        if (isImg) {
          attachmentsHtml += `
            <a href="${att.file_url}" target="_blank" rel="noopener">
              <img src="${att.file_url}" class="msg-att-img" alt="${att.file_name}"/>
            </a>`;
        } else {
          attachmentsHtml += `
            <a href="${att.file_url}" target="_blank" download="${att.file_name}" class="msg-att-doc">
              📄 <span>${att.file_name}</span> (${Math.round(att.file_size / 1024)} KB)
            </a>`;
        }
      });
    }

    let receiptHtml = '';
    if (!isInternal && !isCustomer) {
      const isSeen = msg.status === 'seen';
      receiptHtml = `
        <span class="msg-receipt ${isSeen ? 'seen' : ''}">
          ${isSeen ? renderDoubleCheck() : renderSingleCheck()}
        </span>`;
    }

    row.innerHTML = `
      <span class="msg-author">${isInternal ? '🔒 Private Note' : authorLabel}</span>
      <div class="bubble">
        ${isInternal ? `<div class="internal-note-header">🔒 NOTE BY ${msg.sender_name || 'TEAM'}:</div>` : ''}
        ${msg.text ? `<div>${escapeHtml(msg.text)}</div>` : ''}
        ${attachmentsHtml}
      </div>
      <div class="msg-time-row">
        <span>${formatTime(msg.created_at)}</span>
        ${receiptHtml}
      </div>
    `;

    stream.appendChild(row);
  }

  // --- Outbound Actions ---
  async function sendReplyOrNote() {
    const textarea = document.getElementById('composerTextarea');
    const text = textarea.value.trim();
    const attachment = state.selectedAttachment;

    if (!text && !attachment) return;

    if (!state.currentConversationId) return;

    const isInternal = state.composerMode === 'note';

    if (isInternal) {
      // Save internal note
      try {
        const res = await apiFetch(`/api/admin/conversation/${state.currentConversationId}/notes`, {
          method: 'POST',
          body: JSON.stringify({ noteText: text })
        });
        if (res.success) {
          // Re-render note
          renderMessageItem({
            sender_type: 'agent',
            sender_name: state.agent.name,
            text,
            is_internal: true,
            created_at: new Date().toISOString()
          }, true);

          // Update notes in right drawer
          const notesData = await apiFetch(`/api/admin/conversation/${state.currentConversationId}`);
          if (notesData.success) {
            renderNotesList(notesData.notes);
          }

          textarea.value = '';
          clearSelectedAttachment();
          scrollToChatBottom();
        }
      } catch (e) {
        alert('Failed to save internal note');
      }
      return;
    }

    // Standard Customer Reply
    if (state.socket && state.socket.connected) {
      state.socket.emit('message:send', {
        conversationId: state.currentConversationId,
        text,
        attachment,
        isInternal: false
      }, (res) => {
        if (res && res.success) {
          textarea.value = '';
          clearSelectedAttachment();
        }
      });
    }
  }

  // --- UI Helpers ---
  function renderSingleCheck() {
    return `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
  }

  function renderDoubleCheck() {
    return `<svg viewBox="0 0 24 24"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>`;
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.innerText = str;
    return d.innerHTML;
  }

  function scrollToChatBottom() {
    const stream = document.getElementById('chatStream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  function clearSelectedAttachment() {
    state.selectedAttachment = null;
    document.getElementById('attachmentFileName').textContent = '';
  }

  // --- File Upload ---
  async function handleAdminFileUpload(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (res.success && res.file) {
        state.selectedAttachment = res.file;
        document.getElementById('attachmentFileName').textContent = `Attached: ${res.file.fileName}`;
      } else {
        alert(res.error || 'Upload failed');
      }
    } catch (e) {
      alert('Error uploading file');
    }
  }

  // --- Bind Event Handlers ---
  function bindEvents() {
    // Login Form Submit
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errBox = document.getElementById('loginError');
      errBox.style.display = 'none';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success && data.token) {
          state.token = data.token;
          state.agent = data.agent;
          localStorage.setItem('pfg_agent_token', data.token);
          showDashboard();
        } else {
          errBox.textContent = data.error || 'Invalid login credentials';
          errBox.style.display = 'block';
        }
      } catch (err) {
        errBox.textContent = 'Server connection error';
        errBox.style.display = 'block';
      }
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Filters & Search
    document.querySelectorAll('#statusFilterPills .filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#statusFilterPills .filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeFilter = btn.dataset.status;
        loadConversations();
      });
    });

    document.getElementById('deptFilterSelect').addEventListener('change', (e) => {
      state.activeDept = e.target.value;
      loadConversations();
    });

    let searchDebounce = null;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.searchQuery = e.target.value.trim();
        loadConversations();
      }, 300);
    });

    // Composer Modes
    const modeReplyBtn = document.getElementById('modeReplyBtn');
    const modeNoteBtn = document.getElementById('modeNoteBtn');
    const inputWrap = document.querySelector('.composer-input-wrap');
    const sendModeLabel = document.getElementById('sendModeLabel');
    const textarea = document.getElementById('composerTextarea');

    modeReplyBtn.addEventListener('click', () => {
      state.composerMode = 'reply';
      modeReplyBtn.classList.add('active');
      modeNoteBtn.classList.remove('active');
      inputWrap.classList.remove('note-mode');
      sendModeLabel.textContent = 'Reply';
      textarea.placeholder = 'Type reply (Enter to send, Shift+Enter for newline)...';
    });

    modeNoteBtn.addEventListener('click', () => {
      state.composerMode = 'note';
      modeNoteBtn.classList.add('active');
      modeReplyBtn.classList.remove('active');
      inputWrap.classList.add('note-mode');
      sendModeLabel.textContent = 'Note';
      textarea.placeholder = 'Type internal private note (visible only to support team)...';
    });

    // Canned Response Selection Macro
    document.getElementById('cannedResponseSelect').addEventListener('change', (e) => {
      const shortcut = e.target.value;
      if (!shortcut) return;
      const found = state.cannedResponses.find(cr => cr.shortcut === shortcut);
      if (found) {
        let text = found.text;
        text = text.replace('{{agent_name}}', state.agent ? state.agent.name : 'Support Agent');
        textarea.value = text;
        textarea.focus();
      }
      e.target.value = '';
    });

    // Send button & Enter key
    document.getElementById('adminSendBtn').addEventListener('click', sendReplyOrNote);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendReplyOrNote();
      }
    });

    // Agent Typing indicator
    let typingTimer = null;
    textarea.addEventListener('input', () => {
      if (state.composerMode === 'note') return; // Don't trigger typing for internal notes
      if (state.socket && state.currentConversationId) {
        state.socket.emit('typing:start', { conversationId: state.currentConversationId });
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
          state.socket.emit('typing:stop', { conversationId: state.currentConversationId });
        }, 1500);
      }
    });

    // Attachments
    const adminFileInput = document.getElementById('adminFileInput');
    document.getElementById('adminAttachBtn').addEventListener('click', () => adminFileInput.click());
    adminFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleAdminFileUpload(e.target.files[0]);
        adminFileInput.value = '';
      }
    });

    // Status Change
    document.getElementById('threadStatusSelect').addEventListener('change', async (e) => {
      if (!state.currentConversationId) return;
      const status = e.target.value;
      await apiFetch(`/api/admin/conversation/${state.currentConversationId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status })
      });
      loadConversations();
      loadAnalytics();
    });

    // Assign Agent
    document.getElementById('threadAssignSelect').addEventListener('change', async (e) => {
      if (!state.currentConversationId) return;
      const agentId = e.target.value;
      await apiFetch(`/api/admin/conversation/${state.currentConversationId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ agentId })
      });
      loadConversations();
    });

    // Export Transcript
    document.getElementById('exportTranscriptBtn').addEventListener('click', () => {
      if (!state.currentConversationId) return;
      window.open(`/api/admin/conversation/${state.currentConversationId}/export?format=txt`, '_blank');
    });

    // Drawer Toggle
    document.getElementById('toggleDrawerBtn').addEventListener('click', () => {
      const drawer = document.getElementById('rightDrawer');
      drawer.style.display = drawer.style.display === 'none' ? 'flex' : 'none';
    });

    // Tab Switcher (Live Inbox vs Brand Customizer)
    const tabInboxBtn = document.getElementById('tabInboxBtn');
    const tabSettingsBtn = document.getElementById('tabSettingsBtn');
    const chatMain = document.getElementById('chatMain');
    const rightDrawer = document.getElementById('rightDrawer');
    const settingsMain = document.getElementById('settingsMain');
    const inboxControlsWrap = document.getElementById('inboxControlsWrap');
    const convList = document.getElementById('conversationList');

    function switchView(view) {
      state.activeView = view;
      if (view === 'inbox') {
        tabInboxBtn.classList.add('active');
        tabSettingsBtn.classList.remove('active');
        chatMain.style.display = state.currentConversationId ? 'flex' : 'none';
        if (!state.currentConversationId) {
          document.getElementById('noSelectionView').style.display = 'flex';
          chatMain.style.display = 'flex';
        }
        rightDrawer.style.display = state.currentConversationId ? 'flex' : 'none';
        settingsMain.style.display = 'none';
        inboxControlsWrap.style.display = 'flex';
        convList.style.display = 'block';
      } else {
        tabSettingsBtn.classList.add('active');
        tabInboxBtn.classList.remove('active');
        chatMain.style.display = 'none';
        rightDrawer.style.display = 'none';
        settingsMain.style.display = 'block';
        loadSettings();
      }
    }

    tabInboxBtn.addEventListener('click', () => switchView('inbox'));
    tabSettingsBtn.addEventListener('click', () => switchView('settings'));

    // Color Pickers sync
    const colorPicker = document.getElementById('setColorPicker');
    const colorText = document.getElementById('setBrandColor');
    colorPicker.addEventListener('input', (e) => {
      colorText.value = e.target.value;
      updateMockup();
    });
    colorText.addEventListener('input', (e) => {
      if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
        colorPicker.value = e.target.value;
      }
      updateMockup();
    });

    // Real-time mockup live typing listeners
    ['setCompanyName', 'setLogoUrl', 'setTagline', 'setHeaderGradient', 'setWelcomeTitle', 'setWelcomeSubtitle', 'setSecurityNotice'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateMockup);
    });

    document.getElementById('setPositionSelect').addEventListener('change', updateMockup);

    // Add FAQ Pill
    document.getElementById('addPillBtn').addEventListener('click', () => {
      const labelInput = document.getElementById('newPillLabel');
      const textInput = document.getElementById('newPillText');
      const label = labelInput.value.trim();
      const text = textInput.value.trim();
      if (!label || !text) {
        alert('Please provide both pill label and message text');
        return;
      }
      state.siteSettings.quick_replies.push({ label, text });
      labelInput.value = '';
      textInput.value = '';
      renderPillsManager();
      updateMockup();
    });

    // Save Settings
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

    // Copy Embed Snippet
    document.getElementById('copyEmbedBtn').addEventListener('click', () => {
      const code = document.getElementById('liveEmbedCode').innerText;
      navigator.clipboard.writeText(code);
      alert('Embed script copied to clipboard!');
    });
  }

  // --- Brand Customizer & Settings Handlers ---
  async function loadSettings() {
    try {
      const data = await apiFetch('/api/admin/settings');
      if (data.success && data.settings) {
        state.siteSettings = data.settings;
        renderSettingsForm();
        updateMockup();
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  function renderSettingsForm() {
    const s = state.siteSettings;
    document.getElementById('setCompanyName').value = s.company_name || 'PFG Support';
    document.getElementById('setLogoUrl').value = s.logo_url || '';
    document.getElementById('setTagline').value = s.tagline || 'Online • Typically replies instantly';
    document.getElementById('setBrandColor').value = s.brand_color || '#4F46E5';
    document.getElementById('setColorPicker').value = s.brand_color || '#4F46E5';
    document.getElementById('setHeaderGradient').value = s.header_gradient || 'linear-gradient(135deg, #0A1128 0%, #1E1B4B 100%)';
    document.getElementById('setPositionSelect').value = s.position || 'right';
    document.getElementById('setWelcomeTitle').value = s.welcome_title || '👋 Welcome to Live Support';
    document.getElementById('setWelcomeSubtitle').value = s.welcome_subtitle || '';
    document.getElementById('setSecurityNotice').value = s.security_notice || '';

    // Update sidebar brand title too
    if (document.getElementById('sidebarBrandTitle')) {
      document.getElementById('sidebarBrandTitle').textContent = s.company_name || 'PFG Support';
    }

    renderPillsManager();
  }

  function renderPillsManager() {
    const list = document.getElementById('pillsManagerList');
    list.innerHTML = '';
    const pills = state.siteSettings.quick_replies || [];

    if (pills.length === 0) {
      list.innerHTML = '<div class="empty-list" style="padding:10px;">No quick reply pills added yet.</div>';
      return;
    }

    pills.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'pill-manage-item';
      item.innerHTML = `
        <span class="pill-manage-label">${escapeHtml(p.label)}</span>
        <span class="pill-manage-text">${escapeHtml(p.text)}</span>
        <button class="pill-del-btn" title="Delete Pill"><i class="bi bi-trash"></i></button>
      `;
      item.querySelector('.pill-del-btn').addEventListener('click', () => {
        state.siteSettings.quick_replies.splice(idx, 1);
        renderPillsManager();
        updateMockup();
      });
      list.appendChild(item);
    });
  }

  function updateMockup() {
    const name = document.getElementById('setCompanyName').value || 'Support';
    const logo = document.getElementById('setLogoUrl').value;
    const tagline = document.getElementById('setTagline').value || 'Online';
    const color = document.getElementById('setBrandColor').value || '#4F46E5';
    const gradient = document.getElementById('setHeaderGradient').value || 'linear-gradient(135deg, #0A1128 0%, #1E1B4B 100%)';
    const sec = document.getElementById('setSecurityNotice').value;
    const wTitle = document.getElementById('setWelcomeTitle').value || '👋 Welcome';
    const wSub = document.getElementById('setWelcomeSubtitle').value || '';

    // Header & Avatar
    document.getElementById('mockTitle').textContent = name;
    document.getElementById('mockTagline').textContent = tagline;
    document.getElementById('mockHeader').style.background = gradient;
    const avatar = document.getElementById('mockAvatar');
    if (logo) {
      avatar.innerHTML = `<img src="${logo}" alt="Logo">`;
    } else {
      avatar.innerHTML = `<i class="bi bi-shield-check"></i>`;
    }

    // Colors
    document.getElementById('mockSendBtn').style.background = color;
    document.getElementById('mockLauncherBtn').style.background = color;
    document.getElementById('mockAgentBubble').style.borderColor = color;

    // Security & Welcome
    document.getElementById('mockSecText').textContent = sec;
    document.getElementById('mockWelcomeH5').textContent = wTitle;
    document.getElementById('mockWelcomeP').textContent = wSub;

    // Pills
    const pillsWrap = document.getElementById('mockPills');
    pillsWrap.innerHTML = '';
    const pills = state.siteSettings.quick_replies || [];
    pills.forEach(p => {
      const span = document.createElement('span');
      span.className = 'mock-pill';
      span.textContent = p.label;
      pillsWrap.appendChild(span);
    });
  }

  async function saveSettings() {
    const alertBox = document.getElementById('settingsAlert');
    alertBox.style.display = 'none';

    const payload = {
      siteId: 'pfg_gateway_default',
      settings: {
        company_name: document.getElementById('setCompanyName').value.trim(),
        logo_url: document.getElementById('setLogoUrl').value.trim(),
        tagline: document.getElementById('setTagline').value.trim(),
        brand_color: document.getElementById('setBrandColor').value.trim(),
        header_gradient: document.getElementById('setHeaderGradient').value.trim(),
        position: document.getElementById('setPositionSelect').value,
        welcome_title: document.getElementById('setWelcomeTitle').value.trim(),
        welcome_subtitle: document.getElementById('setWelcomeSubtitle').value.trim(),
        security_notice: document.getElementById('setSecurityNotice').value.trim(),
        quick_replies: state.siteSettings.quick_replies || []
      }
    };

    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (res.success) {
        state.siteSettings = res.settings;
        alertBox.className = 'settings-alert success';
        alertBox.innerHTML = '<i class="bi bi-check-circle-fill"></i> Settings updated and broadcasted live to all customer widgets!';
        alertBox.style.display = 'block';

        if (document.getElementById('sidebarBrandTitle')) {
          document.getElementById('sidebarBrandTitle').textContent = res.settings.company_name;
        }

        setTimeout(() => {
          alertBox.style.display = 'none';
        }, 4000);
      } else {
        throw new Error(res.error || 'Failed to save');
      }
    } catch (e) {
      alertBox.className = 'settings-alert error';
      alertBox.textContent = `Error: ${e.message}`;
      alertBox.style.display = 'block';
    }
  }
  }

  // Init
  window.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    checkAuth();
  });
})();
