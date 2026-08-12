(function (global) {
  if (!global.AIAssistantCore || typeof global.AIAssistantCore.create !== 'function') {
    return;
  }

  var AI_CURRENCY_CODES = ['USD', 'EUR', 'DOP', 'MXN', 'COP', 'PAB', 'CRC', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];

  var AI_SYSTEM_PROMPT = [
    'You are an AI assistant specialized in analyzing CRM conversation histories and attached documents.',
    '',
    'Below are the case messages and optional document extracts you must use as context for all questions in this conversation.',
    'Do not re-read or re-summarize them unless explicitly asked.',
    '',
    'Case messages:',
    '{{MESSAGES}}',
    '',
    'Document extracts:',
    '{{DOCUMENTS}}',
    '',
    'Formatting rule for monetary values:',
    '- Use full amount format with thousand separators and decimals (no scaling).',
    '- Do not append "mil" and do not convert to thousands.',
    '- Example: 9 483 714,63 USD -> 9,483,714.63 USD.'
  ].join('\n');

  var SUGGESTIONS = {
    summarize: 'Summarize the case messages into a clear, concise, and well-structured summary. Capture the main ideas, key decisions, and any action items or conclusions.',
    keypoints: 'List the key points from the case messages as a concise bullet list.',
    actions: 'Extract all action items and pending tasks mentioned in the case messages.',
    documents: 'Answer based on the attached document extracts. Mention which file(s) support your answer and say when information is missing.'
  };

  global.crmRenderAiMarkdown = global.AIAssistantCore.renderMarkdownToHtml;

  function getById(id) {
    return document.getElementById(id);
  }

  // La instancia se publica en window.CrmAI para que los menus de acciones
  // de cada adjunto puedan abrir el asistente sobre ese documento concreto
  // (ver public/js/scripts_crm.js).
  global.CrmAI = global.AIAssistantCore.create({
    openButtonId: 'openAiModal',
    modalId: 'aiSummaryModal',
    closeButtonId: 'closeAiModal',
    chatWindowId: 'aiChatWindow',
    loadingRowId: 'aiLoadingRow',
    promptId: 'aiUserPrompt',
    sendButtonId: 'aiSendBtn',
    filesPanelId: 'aiFilesPanel',
    filesToggleId: 'aiFilesToggle',
    filesListId: 'aiFilesList',
    filesCountId: 'aiFilesCount',
    docsStatusId: 'aiDocsStatus',
    contextEndpoint: '/api/ai/crm-context',
    contextIdQueryParam: 'crm_id',
    sendEndpoint: '/api/ai/send',
    saveEndpoint: '/api/ai/save-message',
    systemPromptTemplate: AI_SYSTEM_PROMPT,
    suggestions: SUGGESTIONS,
    chatActionName: 'chat',
    addToCaseLabel: 'Add to case',
    enableSaveAction: true,
    normalizeCurrency: true,
    currencyCodes: AI_CURRENCY_CODES,
    noContextMessage: 'No messages found in this case.',
    docsMissingMessage: 'No document context selected.',
    getContextId: function () {
      var crmInput = getById('crm_id');
      return crmInput ? crmInput.value : null;
    },
    getSolicitante: function () {
      return (getById('UserID') || getById('UsuarioID') || getById('code') || {}).value || 'unknown';
    },
    buildSendPayload: function (prompt, action, stream, contextId, solicitante) {
      return {
        model: 'gpt-oss:20b',
        prompt: prompt,
        stream: !!stream,
        crm_id: contextId,
        solicitante: solicitante,
        accion: action || 'chat'
      };
    },
    buildSavePayload: function (text, logId) {
      var crmInput = getById('crm_id');
      var crmId = crmInput ? crmInput.value : null;
      if (!crmId) return null;
      return {
        crm_id: crmId,
        summary: text,
        solicitante: (getById('UserID') || getById('UsuarioID') || getById('code') || {}).value || 'unknown',
        log_id: logId || null
      };
    },
    onSaveSuccess: function (payload) {
      if (typeof global.crm_case_details === 'function' && payload && payload.crm_id) {
        global.crm_case_details(payload.crm_id);
      }
    }
  });
}(window));
