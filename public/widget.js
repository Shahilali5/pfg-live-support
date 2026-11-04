/**
 * PFG Live Support - Embeddable Customer Chat Widget
 * High-performance, zero-dependency embed script.
 */
(function () {
  'use strict';

  // Prevent multiple initializations
  if (window.__PFG_CHAT_INITIALIZED__) return;
  window.__PFG_CHAT_INITIALIZED__ = true;

  // Detect script attributes & host origin
  const currentScript = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const scriptSrc = currentScript ? currentScript.src : window.location.origin;
  const baseUrl = (function () {
    try {
      const url = new URL(scriptSrc);
      return url.origin;
    } catch (e) {
      return window.location.origin;
    }
  })();

  const siteId = (currentScript && currentScript.getAttribute('data-site-id')) || 'pfg_gateway_default';

  // Script tag and runtime inline configuration overrides
  const scriptOverrides = {
    company_name: currentScript && currentScript.getAttribute('data-company-name'),
    logo_url: currentScript && currentScript.getAttribute('data-logo-url'),
    brand_color: currentScript && currentScript.getAttribute('data-primary-color'),
    position: currentScript && currentScript.getAttribute('data-position'),
    security_notice: currentScript && currentScript.getAttribute('data-security-notice')
  };

  // State Management
  const state = {
    isOpen: false,
    isExpanded: false,
    isMuted: localStorage.getItem('pfg_muted') === 'true',
    unreadCount: 0,
    sessionToken: localStorage.getItem('pfg_session_token') || null,
    conversationId: localStorage.getItem('pfg_conversation_id') || null,
    customer: null,
    socket: null,
    isOnline: true,
    typingTimeout: null,
    audioCtx: null,
    config: {
      company_name: 'PFG Support',
      logo_url: '',
      tagline: 'Online • Typically replies instantly',
      brand_color: '#4F46E5',
      header_gradient: 'linear-gradient(135deg, #0A1128 0%, #1E1B4B 100%)',
      position: 'right',
      security_notice: 'Support Note: Never share confidential passwords, security keys, or OTPs.',
      welcome_title: '👋 Welcome to Live Support',
      welcome_subtitle: 'How can our team help you today? Choose a quick option below or chat with us directly.',
      quick_replies: [
        { label: '👋 General Inquiry', text: 'Hi! I have a question about your service.' },
        { label: '⚡ Product Demo & Pricing', text: 'Can you help me understand your features and pricing?' },
        { label: '🛠️ Technical Support', text: 'I need help with setup and technical troubleshooting.' },
        { label: '💬 Talk to an Agent', text: 'I would like to speak directly with a support agent.' }
      ]
    }
  };

    // 1. Inject Stylesheet (Self-contained fail-safe + external link)
  const WIDGET_EMBEDDED_CSS = "/* ==========================================================================\r\n   PFG Live Support - Customer Widget Stylesheet\r\n   Fintech-grade Design (Navy, Crisp White, Electric Indigo & Purple)\r\n   Scoped strictly under #pfg-chat-root\r\n   ========================================================================== */\r\n\r\n#pfg-chat-root {\r\n  --pfg-primary: #4f46e5;\r\n  --pfg-primary-hover: #4338ca;\r\n  --pfg-primary-light: #eef2ff;\r\n  --pfg-accent: #818cf8;\r\n  --pfg-navy-dark: #0a1128;\r\n  --pfg-navy-surface: #0f172a;\r\n  --pfg-text-main: #0f172a;\r\n  --pfg-text-muted: #64748b;\r\n  --pfg-bg-bubble-agent: #f1f5f9;\r\n  --pfg-border: #e2e8f0;\r\n  --pfg-shadow: 0 20px 35px -5px rgba(15, 23, 42, 0.2), 0 10px 15px -5px rgba(0, 0, 0, 0.1);\r\n  --pfg-font: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif;\r\n  \r\n  font-family: var(--pfg-font);\r\n  font-size: 14px;\r\n  line-height: 1.5;\r\n  color: var(--pfg-text-main);\r\n  box-sizing: border-box;\r\n  z-index: 2147483640;\r\n  position: fixed;\r\n  bottom: 24px;\r\n  right: 24px;\r\n}\r\n\r\n/* Left Position Override */\r\n#pfg-chat-root.pfg-pos-left {\r\n  right: auto;\r\n  left: 24px;\r\n}\r\n\r\n#pfg-chat-root.pfg-pos-left .pfg-chat-window {\r\n  right: auto;\r\n  left: 0;\r\n  transform-origin: bottom left;\r\n}\r\n\r\n#pfg-chat-root * {\r\n  box-sizing: border-box;\r\n  margin: 0;\r\n  padding: 0;\r\n}\r\n\r\n/* Floating Trigger Button */\r\n.pfg-launcher-btn {\r\n  width: 60px;\r\n  height: 60px;\r\n  border-radius: 50%;\r\n  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);\r\n  color: #ffffff;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  cursor: pointer;\r\n  box-shadow: 0 10px 25px -4px rgba(79, 70, 229, 0.5), 0 4px 10px -2px rgba(0, 0, 0, 0.1);\r\n  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);\r\n  position: relative;\r\n  user-select: none;\r\n  border: none;\r\n  outline: none;\r\n}\r\n\r\n.pfg-launcher-btn:hover {\r\n  transform: scale(1.08) translateY(-2px);\r\n  box-shadow: 0 15px 30px -4px rgba(79, 70, 229, 0.65);\r\n}\r\n\r\n.pfg-launcher-btn:active {\r\n  transform: scale(0.96);\r\n}\r\n\r\n.pfg-launcher-icon,\r\n.pfg-launcher-close-icon {\r\n  width: 28px;\r\n  height: 28px;\r\n  transition: transform 0.3s ease, opacity 0.3s ease;\r\n  fill: currentColor;\r\n}\r\n\r\n.pfg-launcher-close-icon {\r\n  display: none;\r\n}\r\n\r\n.pfg-open .pfg-launcher-icon {\r\n  display: none;\r\n}\r\n\r\n.pfg-open .pfg-launcher-close-icon {\r\n  display: block;\r\n}\r\n\r\n/* Unread Badge */\r\n.pfg-unread-badge {\r\n  position: absolute;\r\n  top: -4px;\r\n  right: -4px;\r\n  background: #ef4444;\r\n  color: #ffffff;\r\n  font-size: 11px;\r\n  font-weight: 700;\r\n  min-width: 20px;\r\n  height: 20px;\r\n  border-radius: 10px;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  padding: 0 5px;\r\n  border: 2px solid #ffffff;\r\n  animation: pfgPulse 2s infinite;\r\n}\r\n\r\n@keyframes pfgPulse {\r\n  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }\r\n  70% { transform: scale(1.05); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }\r\n  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }\r\n}\r\n\r\n/* Chat Window Container */\r\n.pfg-chat-window {\r\n  position: absolute;\r\n  bottom: 76px;\r\n  right: 0;\r\n  width: 390px;\r\n  height: 600px;\r\n  max-height: calc(100vh - 110px);\r\n  background: #ffffff;\r\n  border-radius: 20px;\r\n  box-shadow: var(--pfg-shadow);\r\n  border: 1px solid rgba(226, 232, 240, 0.9);\r\n  display: flex;\r\n  flex-direction: column;\r\n  overflow: hidden;\r\n  opacity: 0;\r\n  visibility: hidden;\r\n  transform: translateY(20px) scale(0.96);\r\n  transform-origin: bottom right;\r\n  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.25s;\r\n}\r\n\r\n.pfg-chat-window.pfg-visible {\r\n  opacity: 1;\r\n  visibility: visible;\r\n  transform: translateY(0) scale(1);\r\n}\r\n\r\n/* Fullscreen / Expanded Mode */\r\n.pfg-chat-window.pfg-expanded {\r\n  width: 520px;\r\n  height: 720px;\r\n  max-height: calc(100vh - 90px);\r\n}\r\n\r\n/* Window Header */\r\n.pfg-header {\r\n  background: linear-gradient(135deg, #0a1128 0%, #1e1b4b 100%);\r\n  color: #ffffff;\r\n  padding: 16px 20px;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  border-bottom: 1px solid rgba(255, 255, 255, 0.1);\r\n  position: relative;\r\n}\r\n\r\n.pfg-header-brand {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 12px;\r\n}\r\n\r\n.pfg-avatar-wrap {\r\n  position: relative;\r\n  width: 42px;\r\n  height: 42px;\r\n  border-radius: 12px;\r\n  background: linear-gradient(135deg, #4f46e5 0%, #9333ea 100%);\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);\r\n}\r\n\r\n.pfg-avatar-wrap svg {\r\n  width: 22px;\r\n  height: 22px;\r\n  fill: #ffffff;\r\n}\r\n\r\n.pfg-header-title {\r\n  font-size: 16px;\r\n  font-weight: 700;\r\n  letter-spacing: -0.2px;\r\n  color: #ffffff;\r\n  line-height: 1.2;\r\n}\r\n\r\n.pfg-status-indicator {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  font-size: 11.5px;\r\n  color: #cbd5e1;\r\n  margin-top: 2px;\r\n}\r\n\r\n.pfg-status-dot {\r\n  width: 8px;\r\n  height: 8px;\r\n  border-radius: 50%;\r\n  background: #10b981;\r\n  box-shadow: 0 0 6px #10b981;\r\n}\r\n\r\n.pfg-status-dot.pfg-offline {\r\n  background: #94a3b8;\r\n  box-shadow: none;\r\n}\r\n\r\n.pfg-header-actions {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n}\r\n\r\n.pfg-btn-icon {\r\n  background: rgba(255, 255, 255, 0.12);\r\n  border: none;\r\n  outline: none;\r\n  color: #e2e8f0;\r\n  width: 30px;\r\n  height: 30px;\r\n  border-radius: 8px;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  cursor: pointer;\r\n  transition: background 0.2s, color 0.2s;\r\n}\r\n\r\n.pfg-btn-icon:hover {\r\n  background: rgba(255, 255, 255, 0.22);\r\n  color: #ffffff;\r\n}\r\n\r\n/* Security Notice Ribbon */\r\n.pfg-security-banner {\r\n  background: #fffbeb;\r\n  border-bottom: 1px solid #fef3c7;\r\n  padding: 8px 14px;\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  font-size: 11.5px;\r\n  color: #92400e;\r\n  line-height: 1.35;\r\n  font-weight: 500;\r\n}\r\n\r\n.pfg-security-banner svg {\r\n  flex-shrink: 0;\r\n  width: 14px;\r\n  height: 14px;\r\n  fill: #d97706;\r\n}\r\n\r\n/* Messages Scrollable Body */\r\n.pfg-messages-body {\r\n  flex: 1;\r\n  overflow-y: auto;\r\n  padding: 16px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n  background: #f8fafc;\r\n  scroll-behavior: smooth;\r\n}\r\n\r\n.pfg-welcome-card {\r\n  background: #ffffff;\r\n  border: 1px solid #e2e8f0;\r\n  border-radius: 14px;\r\n  padding: 14px;\r\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);\r\n  text-align: left;\r\n}\r\n\r\n.pfg-welcome-card h4 {\r\n  font-size: 14px;\r\n  font-weight: 600;\r\n  color: #0f172a;\r\n  margin-bottom: 4px;\r\n}\r\n\r\n.pfg-welcome-card p {\r\n  font-size: 12.5px;\r\n  color: #64748b;\r\n  margin-bottom: 12px;\r\n}\r\n\r\n/* Quick Reply FAQ Pills */\r\n.pfg-quick-replies {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px;\r\n}\r\n\r\n.pfg-pill-btn {\r\n  background: #eef2ff;\r\n  color: #4338ca;\r\n  border: 1px solid #c7d2fe;\r\n  padding: 6px 12px;\r\n  border-radius: 20px;\r\n  font-size: 12px;\r\n  font-weight: 500;\r\n  cursor: pointer;\r\n  transition: all 0.2s ease;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 5px;\r\n}\r\n\r\n.pfg-pill-btn:hover {\r\n  background: #4f46e5;\r\n  color: #ffffff;\r\n  border-color: #4f46e5;\r\n  transform: translateY(-1px);\r\n}\r\n\r\n/* Message Rows */\r\n.pfg-msg-row {\r\n  display: flex;\r\n  flex-direction: column;\r\n  max-width: 82%;\r\n  position: relative;\r\n}\r\n\r\n.pfg-msg-row.pfg-customer {\r\n  align-self: flex-end;\r\n  align-items: flex-end;\r\n}\r\n\r\n.pfg-msg-row.pfg-agent {\r\n  align-self: flex-start;\r\n  align-items: flex-start;\r\n}\r\n\r\n.pfg-msg-sender {\r\n  font-size: 11px;\r\n  font-weight: 600;\r\n  color: #64748b;\r\n  margin-bottom: 3px;\r\n  margin-left: 2px;\r\n}\r\n\r\n.pfg-msg-bubble {\r\n  padding: 10px 14px;\r\n  font-size: 13.5px;\r\n  line-height: 1.45;\r\n  word-break: break-word;\r\n  position: relative;\r\n}\r\n\r\n.pfg-customer .pfg-msg-bubble {\r\n  background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);\r\n  color: #ffffff;\r\n  border-radius: 16px 16px 4px 16px;\r\n  box-shadow: 0 3px 8px rgba(79, 70, 229, 0.2);\r\n}\r\n\r\n.pfg-agent .pfg-msg-bubble {\r\n  background: #ffffff;\r\n  color: #0f172a;\r\n  border: 1px solid #e2e8f0;\r\n  border-radius: 16px 16px 16px 4px;\r\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);\r\n}\r\n\r\n.pfg-msg-footer {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 5px;\r\n  margin-top: 4px;\r\n  font-size: 10.5px;\r\n  color: #94a3b8;\r\n}\r\n\r\n.pfg-customer .pfg-msg-footer {\r\n  justify-content: flex-end;\r\n}\r\n\r\n/* Read Receipts */\r\n.pfg-receipt {\r\n  display: inline-flex;\r\n  align-items: center;\r\n}\r\n\r\n.pfg-receipt svg {\r\n  width: 13px;\r\n  height: 13px;\r\n}\r\n\r\n.pfg-receipt.pfg-seen {\r\n  color: #6366f1;\r\n}\r\n\r\n/* Attachments inside bubble */\r\n.pfg-attachment-thumb {\r\n  max-width: 220px;\r\n  max-height: 160px;\r\n  border-radius: 10px;\r\n  margin-top: 6px;\r\n  cursor: pointer;\r\n  object-fit: cover;\r\n  display: block;\r\n}\r\n\r\n.pfg-file-card {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  background: rgba(0, 0, 0, 0.05);\r\n  padding: 8px 10px;\r\n  border-radius: 8px;\r\n  margin-top: 6px;\r\n  text-decoration: none;\r\n  color: inherit;\r\n  font-size: 12px;\r\n}\r\n\r\n.pfg-customer .pfg-file-card {\r\n  background: rgba(255, 255, 255, 0.18);\r\n  color: #ffffff;\r\n}\r\n\r\n/* Typing Indicator */\r\n.pfg-typing-indicator {\r\n  display: none;\r\n  align-self: flex-start;\r\n  align-items: center;\r\n  gap: 4px;\r\n  background: #ffffff;\r\n  border: 1px solid #e2e8f0;\r\n  padding: 8px 14px;\r\n  border-radius: 16px;\r\n  margin-bottom: 6px;\r\n}\r\n\r\n.pfg-typing-indicator.pfg-active {\r\n  display: flex;\r\n}\r\n\r\n.pfg-typing-text {\r\n  font-size: 11.5px;\r\n  color: #64748b;\r\n  margin-right: 4px;\r\n}\r\n\r\n.pfg-typing-dot {\r\n  width: 6px;\r\n  height: 6px;\r\n  border-radius: 50%;\r\n  background: #818cf8;\r\n  animation: pfgBounce 1.4s infinite ease-in-out both;\r\n}\r\n\r\n.pfg-typing-dot:nth-child(2) { animation-delay: 0.2s; }\r\n.pfg-typing-dot:nth-child(3) { animation-delay: 0.4s; }\r\n\r\n@keyframes pfgBounce {\r\n  0%, 80%, 100% { transform: scale(0); }\r\n  40% { transform: scale(1); }\r\n}\r\n\r\n/* System Notice Pill */\r\n.pfg-system-msg {\r\n  align-self: center;\r\n  background: #f1f5f9;\r\n  color: #64748b;\r\n  font-size: 11px;\r\n  padding: 4px 12px;\r\n  border-radius: 12px;\r\n  margin: 4px 0;\r\n}\r\n\r\n/* CSAT Rating Overlay */\r\n.pfg-rating-box {\r\n  background: #f8fafc;\r\n  border: 1px dashed #cbd5e1;\r\n  border-radius: 12px;\r\n  padding: 12px;\r\n  text-align: center;\r\n  margin-top: 8px;\r\n}\r\n\r\n.pfg-stars {\r\n  display: flex;\r\n  justify-content: center;\r\n  gap: 6px;\r\n  margin: 6px 0;\r\n}\r\n\r\n.pfg-star-btn {\r\n  background: none;\r\n  border: none;\r\n  font-size: 20px;\r\n  cursor: pointer;\r\n  color: #cbd5e1;\r\n  transition: transform 0.15s, color 0.15s;\r\n}\r\n\r\n.pfg-star-btn.pfg-active,\r\n.pfg-star-btn:hover {\r\n  color: #f59e0b;\r\n  transform: scale(1.2);\r\n}\r\n\r\n/* Emoji Bar */\r\n.pfg-emoji-bar {\r\n  display: none;\r\n  background: #ffffff;\r\n  border-top: 1px solid #e2e8f0;\r\n  padding: 6px 10px;\r\n  gap: 8px;\r\n  overflow-x: auto;\r\n}\r\n\r\n.pfg-emoji-bar.pfg-open {\r\n  display: flex;\r\n}\r\n\r\n.pfg-emoji-btn {\r\n  background: none;\r\n  border: none;\r\n  font-size: 18px;\r\n  cursor: pointer;\r\n  padding: 3px 6px;\r\n  border-radius: 6px;\r\n  transition: background 0.15s;\r\n}\r\n\r\n.pfg-emoji-btn:hover {\r\n  background: #f1f5f9;\r\n}\r\n\r\n/* Chat Footer Input Area */\r\n.pfg-footer {\r\n  background: #ffffff;\r\n  border-top: 1px solid #e2e8f0;\r\n  padding: 10px 14px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n\r\n.pfg-input-row {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n}\r\n\r\n.pfg-input-box {\r\n  flex: 1;\r\n  height: 40px;\r\n  border: 1px solid #cbd5e1;\r\n  border-radius: 20px;\r\n  padding: 0 14px;\r\n  font-size: 13.5px;\r\n  outline: none;\r\n  color: #0f172a;\r\n  background: #f8fafc;\r\n  transition: border-color 0.2s, background 0.2s;\r\n}\r\n\r\n.pfg-input-box:focus {\r\n  border-color: #6366f1;\r\n  background: #ffffff;\r\n}\r\n\r\n.pfg-footer-btn {\r\n  background: none;\r\n  border: none;\r\n  cursor: pointer;\r\n  color: #64748b;\r\n  width: 34px;\r\n  height: 34px;\r\n  border-radius: 50%;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  transition: all 0.2s;\r\n}\r\n\r\n.pfg-footer-btn:hover {\r\n  background: #f1f5f9;\r\n  color: #4f46e5;\r\n}\r\n\r\n.pfg-send-btn {\r\n  background: #4f46e5;\r\n  color: #ffffff;\r\n}\r\n\r\n.pfg-send-btn:hover {\r\n  background: #4338ca;\r\n  color: #ffffff;\r\n  transform: scale(1.05);\r\n}\r\n\r\n.pfg-send-btn svg {\r\n  width: 16px;\r\n  height: 16px;\r\n  fill: currentColor;\r\n}\r\n\r\n.pfg-branding {\r\n  font-size: 10.5px;\r\n  color: #94a3b8;\r\n  text-align: center;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 4px;\r\n  padding-top: 2px;\r\n}\r\n\r\n.pfg-branding span {\r\n  font-weight: 600;\r\n  color: #4f46e5;\r\n}\r\n\r\n/* Mobile Responsive Adjustments */\r\n@media (max-width: 480px) {\r\n  #pfg-chat-root {\r\n    bottom: 16px;\r\n    right: 16px;\r\n  }\r\n  \r\n  .pfg-chat-window {\r\n    position: fixed;\r\n    top: 0;\r\n    left: 0;\r\n    right: 0;\r\n    bottom: 0;\r\n    width: 100vw;\r\n    height: 100vh;\r\n    max-height: 100vh;\r\n    border-radius: 0;\r\n    border: none;\r\n    z-index: 2147483647;\r\n  }\r\n\r\n  .pfg-chat-window.pfg-expanded {\r\n    width: 100vw;\r\n    height: 100vh;\r\n  }\r\n}\r\n";

  function injectStyles() {
    if (document.getElementById('pfg-chat-styles')) return;
    const style = document.createElement('style');
    style.id = 'pfg-chat-styles';
    style.textContent = WIDGET_EMBEDDED_CSS;
    document.head.appendChild(style);

    try {
      const link = document.createElement('link');
      link.id = 'pfg-chat-external-styles';
      link.rel = 'stylesheet';
      link.href = `${baseUrl}/widget.css`;
      document.head.appendChild(link);
    } catch (e) {}
  }

  // 2. Synthesized Notification Chime via Web Audio API (Zero external MP3 dependencies)
  function playNotificationChime() {
    if (state.isMuted) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!state.audioCtx) {
        state.audioCtx = new AudioContext();
      }
      if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
      }

      const now = state.audioCtx.currentTime;
      const osc = state.audioCtx.createOscillator();
      const gain = state.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.12); // A5

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(state.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (err) {
      // Audio autoplay policy catch
    }
  }

  // 3. Inject DOM Widget Hierarchy
  function injectDOM() {
    if (document.getElementById('pfg-chat-root')) return;

    const root = document.createElement('div');
    root.id = 'pfg-chat-root';
    root.innerHTML = `
      <!-- Launcher Button -->
      <button class="pfg-launcher-btn" id="pfgLauncherBtn" aria-label="Open PFG Live Support" title="Chat with PFG Support">
        <svg class="pfg-launcher-icon" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          <path d="M7 9h10v2H7zm0-3h10v2H7z"/>
        </svg>
        <svg class="pfg-launcher-close-icon" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
        <span class="pfg-unread-badge" id="pfgUnreadBadge" style="display: none;">0</span>
      </button>

      <!-- Chat Window -->
      <div class="pfg-chat-window" id="pfgChatWindow">
        <!-- Header -->
        <div class="pfg-header" id="pfgHeader">
          <div class="pfg-header-brand">
            <div class="pfg-avatar-wrap" id="pfgAvatarWrap">
              <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
            </div>
            <div>
              <div class="pfg-header-title" id="pfgHeaderTitle">PFG Support</div>
              <div class="pfg-status-indicator">
                <span class="pfg-status-dot" id="pfgStatusDot"></span>
                <span id="pfgStatusText">Online • Typically replies instantly</span>
              </div>
            </div>
          </div>
          <div class="pfg-header-actions">
            <button class="pfg-btn-icon" id="pfgMuteBtn" title="Toggle Sound" aria-label="Toggle Sound">
              <svg id="pfgMuteIcon" style="width:16px;height:16px;fill:currentColor;" viewBox="0 0 24 24">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
            </button>
            <button class="pfg-btn-icon" id="pfgExpandBtn" title="Expand Window" aria-label="Expand Window">
              <svg id="pfgExpandIcon" style="width:16px;height:16px;fill:currentColor;" viewBox="0 0 24 24">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              </svg>
            </button>
            <button class="pfg-btn-icon" id="pfgCloseBtn" title="Close Chat" aria-label="Close Chat">
              <svg style="width:18px;height:18px;fill:currentColor;" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Security Warning Banner -->
        <div class="pfg-security-banner">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          <div id="pfgSecurityText"><strong>Security Note:</strong> We will never ask for your UPI PIN, OTP, CVV, or passwords.</div>
        </div>

        <!-- Scrollable Messages Area -->
        <div class="pfg-messages-body" id="pfgMessagesBody">
          <!-- Welcome card -->
          <div class="pfg-welcome-card" id="pfgWelcomeCard">
            <h4 id="pfgWelcomeTitle">👋 Welcome to PFG Live Support</h4>
            <p id="pfgWelcomeSub">How can our team help you today? Choose a quick option below or chat with us directly.</p>
            <div class="pfg-quick-replies" id="pfgQuickReplies">
              <button class="pfg-pill-btn" data-reply="Hi! I have a question about your service.">👋 General Inquiry</button>
              <button class="pfg-pill-btn" data-reply="Can you help me understand your features and pricing?">⚡ Product Demo & Pricing</button>
              <button class="pfg-pill-btn" data-reply="I need help with setup and technical troubleshooting.">🛠️ Technical Support</button>
              <button class="pfg-pill-btn" data-reply="I would like to speak directly with a support agent.">💬 Talk to an Agent</button>
            </div>
          </div>

          <!-- Typing indicator bubble -->
          <div class="pfg-typing-indicator" id="pfgTypingIndicator">
            <span class="pfg-typing-text" id="pfgTypingAgent">Agent is typing</span>
            <span class="pfg-typing-dot"></span>
            <span class="pfg-typing-dot"></span>
            <span class="pfg-typing-dot"></span>
          </div>
        </div>

        <!-- Emoji Quick Bar -->
        <div class="pfg-emoji-bar" id="pfgEmojiBar">
          <button class="pfg-emoji-btn">👍</button>
          <button class="pfg-emoji-btn">❤️</button>
          <button class="pfg-emoji-btn">🙏</button>
          <button class="pfg-emoji-btn">🔥</button>
          <button class="pfg-emoji-btn">💳</button>
          <button class="pfg-emoji-btn">🚀</button>
          <button class="pfg-emoji-btn">😊</button>
          <button class="pfg-emoji-btn">⚡</button>
        </div>

        <!-- Footer / Input Form -->
        <div class="pfg-footer">
          <div class="pfg-input-row">
            <!-- Hidden file input -->
            <input type="file" id="pfgFileInput" style="display:none;" accept="image/*,.pdf,.txt,.json">
            <button class="pfg-footer-btn" id="pfgAttachBtn" title="Attach file or screenshot" aria-label="Attach file">
              <svg style="width:18px;height:18px;fill:currentColor;" viewBox="0 0 24 24">
                <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5V6H9v9.5a3.5 3.5 0 0 0 7 0V5a4.5 4.5 0 0 0-9 0v12.5a6 6 0 0 0 12 0V6h-2z"/>
              </svg>
            </button>
            <button class="pfg-footer-btn" id="pfgEmojiToggleBtn" title="Choose emoji" aria-label="Choose emoji">
              <svg style="width:18px;height:18px;fill:currentColor;" viewBox="0 0 24 24">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
              </svg>
            </button>
            <input type="text" class="pfg-input-box" id="pfgInputText" placeholder="Type your message..." autocomplete="off">
            <button class="pfg-footer-btn pfg-send-btn" id="pfgSendBtn" title="Send message" aria-label="Send message">
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
          <div class="pfg-branding">
            <span>Powered by PFG Live Support</span> • 256-Bit TLS Secured
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
  }

  // 4. Dynamic Socket.IO Loader
  function loadSocketIo(callback) {
    if (window.io) {
      return callback();
    }
    const script = document.createElement('script');
    script.src = `${baseUrl}/socket.io/socket.io.js`;
    script.onload = () => callback();
    script.onerror = () => {
      // Fallback to CDN if needed
      const cdnScript = document.createElement('script');
      cdnScript.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
      cdnScript.onload = () => callback();
      document.head.appendChild(cdnScript);
    };
    document.head.appendChild(script);
  }

  // 4.5. White-label Brand Customizer
  function applyBranding(config) {
    if (!config) return;
    state.config = { ...state.config, ...config };

    const root = document.getElementById('pfg-chat-root');
    const header = document.getElementById('pfgHeader');
    const titleEl = document.getElementById('pfgHeaderTitle');
    const avatarWrap = document.getElementById('pfgAvatarWrap');
    const secEl = document.getElementById('pfgSecurityText');
    const welcomeTitleEl = document.getElementById('pfgWelcomeTitle');
    const welcomeSubEl = document.getElementById('pfgWelcomeSub');
    const quickRepliesEl = document.getElementById('pfgQuickReplies');

    if (!root) return;

    // Apply Colors
    if (state.config.brand_color) {
      root.style.setProperty('--pfg-primary', state.config.brand_color);
      const launcher = document.getElementById('pfgLauncherBtn');
      if (launcher) {
        launcher.style.background = `linear-gradient(135deg, ${state.config.brand_color} 0%, #7c3aed 100%)`;
      }
    }

    if (state.config.header_gradient && header) {
      header.style.background = state.config.header_gradient;
    }

    // Position (left vs right)
    if (state.config.position === 'left') {
      root.classList.add('pfg-pos-left');
    } else {
      root.classList.remove('pfg-pos-left');
    }

    // Company Name
    if (titleEl && state.config.company_name) {
      titleEl.textContent = state.config.company_name;
    }

    // Custom Logo
    if (avatarWrap) {
      if (state.config.logo_url) {
        avatarWrap.innerHTML = `<img src="${state.config.logo_url}" alt="Logo" style="width:100%;height:100%;border-radius:10px;object-fit:cover;">`;
      } else {
        avatarWrap.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`;
      }
    }

    // Security Notice
    if (secEl && state.config.security_notice) {
      let note = String(state.config.security_notice).trim();
      note = note.replace(/^(?:pfg\s*)?(?:security|support)\s*note:\s*/i, '');
      secEl.innerHTML = `<strong>Security Note:</strong> ${escapeHtml(note)}`;
    }

    // Welcome Card
    if (welcomeTitleEl && state.config.welcome_title) {
      welcomeTitleEl.textContent = state.config.welcome_title;
    }
    if (welcomeSubEl && state.config.welcome_subtitle) {
      welcomeSubEl.textContent = state.config.welcome_subtitle;
    }

    // Dynamic Quick Replies Pills
    if (quickRepliesEl && Array.isArray(state.config.quick_replies) && state.config.quick_replies.length > 0) {
      quickRepliesEl.innerHTML = '';
      state.config.quick_replies.forEach(qr => {
        const btn = document.createElement('button');
        btn.className = 'pfg-pill-btn';
        btn.textContent = qr.label;
        btn.dataset.reply = qr.text;
        btn.addEventListener('click', () => {
          sendMessage(qr.text);
        });
        quickRepliesEl.appendChild(btn);
      });
    }
  }

  async function fetchAndApplyConfig() {
    try {
      const res = await fetch(`${baseUrl}/api/public/config?siteId=${encodeURIComponent(siteId)}`);
      const data = await res.json();
      if (data.success && data.config) {
        // Merge server config with inline script overrides and window.PFGChatConfig
        const windowOverrides = window.PFGChatConfig || {};
        const merged = {
          ...data.config,
          ...cleanObject(scriptOverrides),
          ...cleanObject(windowOverrides)
        };
        applyBranding(merged);
      }
    } catch (e) {
      // Fallback to inline overrides if server fails
      const windowOverrides = window.PFGChatConfig || {};
      applyBranding({ ...state.config, ...cleanObject(scriptOverrides), ...cleanObject(windowOverrides) });
    }
  }

  function cleanObject(obj) {
    const out = {};
    for (const k in obj) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
        out[k] = obj[k];
      }
    }
    return out;
  }

  // 5. Initialize or Resume Chat Session with Backend
  async function initSession() {
    try {
      const res = await fetch(`${baseUrl}/api/customer/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          sessionToken: state.sessionToken,
          metadata: {
            url: window.location.href,
            referrer: document.referrer,
            title: document.title
          }
        })
      });

      const data = await res.json();
      if (data.success) {
        state.customer = data.customer;
        state.sessionToken = data.customer.sessionToken;
        state.conversationId = data.conversation.conversationId;
        localStorage.setItem('pfg_session_token', state.sessionToken);
        localStorage.setItem('pfg_conversation_id', state.conversationId);

        // Render previous messages if available
        if (data.messages && data.messages.length > 0) {
          data.messages.forEach(msg => renderMessage(msg));
        }

        connectWebSocket();
      }
    } catch (err) {
      console.warn('[PFG Widget] Session bootstrap failed:', err);
    }
  }

  // 6. Connect Real-time WebSocket
  function connectWebSocket() {
    if (!window.io || !state.conversationId) return;

    state.socket = window.io(baseUrl, {
      auth: {
        role: 'customer',
        sessionToken: state.sessionToken
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    state.socket.on('connect', () => {
      // Join conversation room
      state.socket.emit('customer:join_conversation', {
        conversationId: state.conversationId,
        sessionToken: state.sessionToken
      }, (resp) => {
        if (resp && resp.success) {
          updateOnlineStatus(resp.agentsOnline);
        }
      });
    });

    // Receive message
    state.socket.on('message:new', ({ conversationId, message }) => {
      if (conversationId !== state.conversationId) return;
      
      // Avoid duplicate render if we added it optimistically
      const existing = document.getElementById(`pfg-msg-${message.message_id}`) ||
                       document.querySelector(`[data-client-id="${message.client_msg_id}"]`);
      if (existing) {
        existing.id = `pfg-msg-${message.message_id}`;
        updateMessageStatus(message.message_id, message.status);
        return;
      }

      renderMessage(message);

      if (message.sender_type === 'agent') {
        playNotificationChime();
        // Send delivered ACK
        state.socket.emit('message:delivered', {
          messageId: message.message_id,
          conversationId: state.conversationId
        });

        if (!state.isOpen) {
          incrementUnread();
        } else {
          // If open, immediately mark seen
          state.socket.emit('conversation:seen', { conversationId: state.conversationId });
        }
      }
    });

    // Typing indicators from Agent
    state.socket.on('agent:typing', ({ conversationId, agentName, isTyping }) => {
      if (conversationId !== state.conversationId) return;
      const indicator = document.getElementById('pfgTypingIndicator');
      const textSpan = document.getElementById('pfgTypingAgent');
      if (isTyping) {
        textSpan.textContent = `${agentName || 'Agent'} is typing`;
        indicator.classList.add('pfg-active');
        scrollToBottom();
      } else {
        indicator.classList.remove('pfg-active');
      }
    });

    // Agent Online presence updates
    state.socket.on('agent:presence', ({ is_online }) => {
      updateOnlineStatus(is_online);
    });

    // Message status update (delivered)
    state.socket.on('message:status_update', ({ messageId, status }) => {
      updateMessageStatus(messageId, status);
    });

    // Counterparty has seen all messages
    state.socket.on('messages:seen', ({ conversationId, seenBy }) => {
      if (conversationId !== state.conversationId) return;
      if (seenBy === 'agent') {
        document.querySelectorAll('.pfg-receipt').forEach(el => {
          el.innerHTML = renderDoubleCheckSvg();
          el.classList.add('pfg-seen');
        });
      }
    });

    // Real-time White-label settings sync
    state.socket.on('settings:updated', ({ siteId: updatedSiteId, settings }) => {
      if (!updatedSiteId || updatedSiteId === siteId) {
        applyBranding(settings);
      }
    });
  }

  // 7. UI Helpers
  function renderSingleCheckSvg() {
    return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
  }

  function renderDoubleCheckSvg() {
    return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>`;
  }

  function updateOnlineStatus(isOnline) {
    state.isOnline = isOnline;
    const dot = document.getElementById('pfgStatusDot');
    const text = document.getElementById('pfgStatusText');
    if (!dot || !text) return;

    if (isOnline) {
      dot.classList.remove('pfg-offline');
      text.textContent = 'Online • Typically replies instantly';
    } else {
      dot.classList.add('pfg-offline');
      text.textContent = 'Away • Messages sent to support team';
    }
  }

  function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderMessage(msg) {
    const body = document.getElementById('pfgMessagesBody');
    const typingIndicator = document.getElementById('pfgTypingIndicator');

    // System message
    if (msg.sender_type === 'system') {
      const sysDiv = document.createElement('div');
      sysDiv.className = 'pfg-system-msg';
      sysDiv.textContent = msg.text;
      body.insertBefore(sysDiv, typingIndicator);
      scrollToBottom();
      return;
    }

    const row = document.createElement('div');
    row.id = `pfg-msg-${msg.message_id || ''}`;
    row.className = `pfg-msg-row ${msg.sender_type === 'customer' ? 'pfg-customer' : 'pfg-agent'}`;
    if (msg.client_msg_id) row.setAttribute('data-client-id', msg.client_msg_id);

    // Sender name for agents
    let senderHtml = '';
    if (msg.sender_type === 'agent') {
      senderHtml = `<span class="pfg-msg-sender">${msg.sender_name || 'PFG Support'}</span>`;
    }

    // Attachments HTML
    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach(att => {
        const isImg = att.mime_type && att.mime_type.startsWith('image/');
        if (isImg) {
          attachmentsHtml += `
            <a href="${baseUrl}${att.file_url}" target="_blank" rel="noopener">
              <img src="${baseUrl}${att.file_url}" class="pfg-attachment-thumb" alt="${att.file_name}" loading="lazy"/>
            </a>`;
        } else {
          attachmentsHtml += `
            <a href="${baseUrl}${att.file_url}" target="_blank" download="${att.file_name}" class="pfg-file-card">
              📄 <span>${att.file_name}</span> (${Math.round(att.file_size / 1024)} KB)
            </a>`;
        }
      });
    }

    // Receipt icon for customer messages
    let receiptHtml = '';
    if (msg.sender_type === 'customer') {
      const isSeen = msg.status === 'seen';
      const isDelivered = msg.status === 'delivered' || isSeen;
      receiptHtml = `
        <span class="pfg-receipt ${isSeen ? 'pfg-seen' : ''}" data-receipt="${msg.message_id}">
          ${isDelivered ? renderDoubleCheckSvg() : renderSingleCheckSvg()}
        </span>`;
    }

    row.innerHTML = `
      ${senderHtml}
      <div class="pfg-msg-bubble">
        ${msg.text ? `<div>${escapeHtml(msg.text)}</div>` : ''}
        ${attachmentsHtml}
      </div>
      <div class="pfg-msg-footer">
        <span>${formatTime(msg.created_at)}</span>
        ${receiptHtml}
      </div>
    `;

    body.insertBefore(row, typingIndicator);
    scrollToBottom();
  }

  function updateMessageStatus(messageId, status) {
    const el = document.querySelector(`[data-receipt="${messageId}"]`);
    if (!el) return;
    if (status === 'delivered') {
      el.innerHTML = renderDoubleCheckSvg();
    } else if (status === 'seen') {
      el.innerHTML = renderDoubleCheckSvg();
      el.classList.add('pfg-seen');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
  }

  function scrollToBottom() {
    const body = document.getElementById('pfgMessagesBody');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }

  function incrementUnread() {
    state.unreadCount += 1;
    const badge = document.getElementById('pfgUnreadBadge');
    if (badge) {
      badge.textContent = state.unreadCount > 9 ? '9+' : state.unreadCount;
      badge.style.display = 'flex';
    }
  }

  function clearUnread() {
    state.unreadCount = 0;
    const badge = document.getElementById('pfgUnreadBadge');
    if (badge) badge.style.display = 'none';
  }

  // 8. Outbound Messaging
  function sendMessage(text, attachment = null) {
    if ((!text || !text.trim()) && !attachment) return;

    const clientMsgId = 'cl_' + Math.random().toString(36).substring(2, 12);
    const optimisticMsg = {
      message_id: 'temp_' + clientMsgId,
      conversation_id: state.conversationId,
      sender_type: 'customer',
      sender_name: 'You',
      text: text ? text.trim() : '',
      status: 'sent',
      client_msg_id: clientMsgId,
      created_at: new Date().toISOString(),
      attachments: attachment ? [attachment] : []
    };

    // Render immediately in chat
    renderMessage(optimisticMsg);

    // Emit via WebSocket
    if (state.socket && state.socket.connected) {
      state.socket.emit('message:send', {
        conversationId: state.conversationId,
        text: text ? text.trim() : '',
        clientMsgId,
        attachment
      }, (res) => {
        if (res && res.success) {
          const tempRow = document.querySelector(`[data-client-id="${clientMsgId}"]`);
          if (tempRow) {
            tempRow.id = `pfg-msg-${res.message.message_id}`;
          }
        }
      });
    }

    // Stop typing indicator on send
    emitTyping(false);
  }

  function emitTyping(isTyping) {
    if (!state.socket || !state.conversationId) return;
    state.socket.emit(isTyping ? 'typing:start' : 'typing:stop', {
      conversationId: state.conversationId
    });
  }

  // 9. File Upload Handler
  async function handleFileUpload(file) {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.file) {
        sendMessage('', data.file);
      } else {
        alert(data.error || 'Failed to upload attachment.');
      }
    } catch (e) {
      alert('Error uploading attachment.');
    }
  }

  // 10. Bind UI Event Listeners
  function bindEvents() {
    const launcher = document.getElementById('pfgLauncherBtn');
    const win = document.getElementById('pfgChatWindow');
    const closeBtn = document.getElementById('pfgCloseBtn');
    const expandBtn = document.getElementById('pfgExpandBtn');
    const muteBtn = document.getElementById('pfgMuteBtn');
    const input = document.getElementById('pfgInputText');
    const sendBtn = document.getElementById('pfgSendBtn');
    const attachBtn = document.getElementById('pfgAttachBtn');
    const fileInput = document.getElementById('pfgFileInput');
    const emojiToggleBtn = document.getElementById('pfgEmojiToggleBtn');
    const emojiBar = document.getElementById('pfgEmojiBar');

    // Toggle Chat Window
    function toggleChat(forceOpen) {
      state.isOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.isOpen;
      if (state.isOpen) {
        win.classList.add('pfg-visible');
        launcher.classList.add('pfg-open');
        clearUnread();
        scrollToBottom();
        input.focus();
        if (state.socket && state.conversationId) {
          state.socket.emit('conversation:seen', { conversationId: state.conversationId });
        }
      } else {
        win.classList.remove('pfg-visible');
        launcher.classList.remove('pfg-open');
        emojiBar.classList.remove('pfg-open');
      }
    }

    launcher.addEventListener('click', () => toggleChat());
    closeBtn.addEventListener('click', () => toggleChat(false));

    // Expand / Fullscreen
    expandBtn.addEventListener('click', () => {
      state.isExpanded = !state.isExpanded;
      win.classList.toggle('pfg-expanded', state.isExpanded);
    });

    // Mute / Unmute
    muteBtn.addEventListener('click', () => {
      state.isMuted = !state.isMuted;
      localStorage.setItem('pfg_muted', state.isMuted);
      muteBtn.style.opacity = state.isMuted ? '0.45' : '1';
      muteBtn.title = state.isMuted ? 'Unmute Sound' : 'Mute Sound';
    });
    if (state.isMuted) muteBtn.style.opacity = '0.45';

    // Send on button or Enter
    sendBtn.addEventListener('click', () => {
      const val = input.value;
      input.value = '';
      sendMessage(val);
      input.focus();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const val = input.value;
        input.value = '';
        sendMessage(val);
      }
    });

    // Keystroke typing indicator
    input.addEventListener('input', () => {
      emitTyping(true);
      clearTimeout(state.typingTimeout);
      state.typingTimeout = setTimeout(() => {
        emitTyping(false);
      }, 1500);
    });

    // Quick Replies in Welcome Card
    document.querySelectorAll('.pfg-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const reply = btn.getAttribute('data-reply');
        sendMessage(reply);
      });
    });

    // Attachment buttons
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileUpload(e.target.files[0]);
        fileInput.value = '';
      }
    });

    // Emoji toggle & insertion
    emojiToggleBtn.addEventListener('click', () => {
      emojiBar.classList.toggle('pfg-open');
    });

    document.querySelectorAll('.pfg-emoji-btn').forEach(ebtn => {
      ebtn.addEventListener('click', () => {
        input.value += ebtn.textContent;
        input.focus();
      });
    });
  }

  // 11. Public Window API
  window.PFGChat = {
    open: () => {
      const win = document.getElementById('pfgChatWindow');
      if (win) win.classList.add('pfg-visible');
      const launcher = document.getElementById('pfgLauncherBtn');
      if (launcher) launcher.classList.add('pfg-open');
      state.isOpen = true;
      clearUnread();
    },
    close: () => {
      const win = document.getElementById('pfgChatWindow');
      if (win) win.classList.remove('pfg-visible');
      const launcher = document.getElementById('pfgLauncherBtn');
      if (launcher) launcher.classList.remove('pfg-open');
      state.isOpen = false;
    },
    toggle: () => {
      state.isOpen ? window.PFGChat.close() : window.PFGChat.open();
    },
    sendMessage: (text) => sendMessage(text),
    setMuted: (muted) => {
      state.isMuted = Boolean(muted);
      localStorage.setItem('pfg_muted', state.isMuted);
    },
    setConfig: (newConfig) => {
      applyBranding(newConfig);
    },
    getConfig: () => ({ ...state.config }),
    playChime: () => playNotificationChime()
  };

  // 12. Main Init Sequence
  function start() {
    injectStyles();
    injectDOM();
    bindEvents();
    fetchAndApplyConfig();
    loadSocketIo(() => {
      initSession();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
