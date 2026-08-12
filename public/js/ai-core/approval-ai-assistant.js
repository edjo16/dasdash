(function (global) {
  if (!global.AIAssistantCore || typeof global.AIAssistantCore.create !== 'function') {
    return;
  }

  var AI_SYSTEM_PROMPT = [
    'You are an AI assistant specialized in analyzing Approval cases.',
    '',
    'Use the approval detail context and optional document extracts below to answer questions.',
    'Do not invent facts that are not present in the provided context.',
    '',
    'Approval context:',
    '{{MESSAGES}}',
    '',
    'Document extracts:',
    '{{DOCUMENTS}}',
    '',
    'If linked CRM references are included in the approval context, use them only as supporting context.'
  ].join('\n');

  var SUGGESTIONS = {
    summarize: 'Summarize this approval with the key business context, current status, and pending items.',
    keypoints: 'List the key points of this approval in concise bullets.',
    actions: 'Extract all pending actions and owners based on the approval detail and comments.',
    documents: 'Answer using the attached document extracts and indicate which file supports each conclusion.'
  };

  function getById(id) {
    return document.getElementById(id);
  }

  // La instancia se publica en window.ApprovalAI para que los menus de
  // acciones de cada archivo puedan abrir el asistente sobre ese documento
  // concreto (ver public/scripts.js).
  global.ApprovalAI = global.AIAssistantCore.create({
    openButtonId: 'openApprovalAiModal',
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
    contextEndpoint: '/api/ai/approval-context',
    contextIdQueryParam: 'approval_id',
    sendEndpoint: '/api/ai/send',
    systemPromptTemplate: AI_SYSTEM_PROMPT,
    suggestions: SUGGESTIONS,
    chatActionName: 'chat',
    enableSaveAction: false,
    normalizeCurrency: false,
    noContextMessage: 'No approval detail was found for this case.',
    docsMissingMessage: 'No document context selected.',
    getContextId: function () {
      var hidden = getById('approval_id_ai');
      if (hidden && hidden.value) return hidden.value;
      var rowInput = getById('ID');
      return rowInput ? rowInput.value : null;
    },
    getSolicitante: function () {
      return (getById('username') || getById('UserID') || getById('UsuarioID') || {}).value || 'unknown';
    },
    getDocumentKey: function (doc) {
      return String(doc.id_msg || 0) + '|' + String(doc.filename || '').toLowerCase() + '|' + String(doc.process || '');
    },
    buildDocSourceLabel: function (doc) {
      return doc.process ? ('process=' + doc.process) : ('approval_id=' + String(doc.id_msg || ''));
    },
    buildSendPayload: function (prompt, action, stream, contextId, solicitante) {
      return {
        model: 'gpt-oss:20b',
        prompt: prompt,
        stream: !!stream,
        approval_id: contextId,
        solicitante: solicitante,
        accion: action || 'chat'
      };
    }
  });
}(window));
