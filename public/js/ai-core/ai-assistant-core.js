(function (global) {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function splitTableRow(line) {
    var clean = String(line || '').trim();
    if (clean.charAt(0) === '|') clean = clean.slice(1);
    if (clean.charAt(clean.length - 1) === '|') clean = clean.slice(0, -1);
    return clean.split('|').map(function (cell) { return cell.trim(); });
  }

  function isTableSeparator(line) {
    var cells = splitTableRow(line);
    if (!cells.length) return false;
    return cells.every(function (cell) {
      return /^:?-{3,}:?$/.test(cell);
    });
  }

  function isTableHeaderCandidate(line, nextLine) {
    var current = String(line || '').trim();
    if (!current || current.indexOf('|') === -1) return false;
    return isTableSeparator(nextLine || '');
  }

  function formatInlineMarkdown(text) {
    var safe = escapeHtml(text);
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    safe = safe.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return safe;
  }

  function isSpecialLineStart(line, nextLine) {
    var trimmed = String(line || '').trim();
    if (!trimmed) return true;
    if (/^```/.test(trimmed)) return true;
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    if (/^>\s?/.test(trimmed)) return true;
    if (/^[-*+]\s+/.test(trimmed)) return true;
    if (/^\d+\.\s+/.test(trimmed)) return true;
    if (isTableHeaderCandidate(trimmed, nextLine)) return true;
    return false;
  }

  function renderMarkdownToHtml(markdown) {
    var normalized = String(markdown || '').replace(/\r\n?/g, '\n');
    var lines = normalized.split('\n');
    var html = [];
    var listType = '';

    function closeList() {
      if (!listType) return;
      html.push('</' + listType + '>');
      listType = '';
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        closeList();
        continue;
      }

      if (/^```/.test(trimmed)) {
        closeList();
        var codeLines = [];
        i += 1;
        while (i < lines.length && !/^```/.test(lines[i].trim())) {
          codeLines.push(lines[i]);
          i += 1;
        }
        html.push('<pre class="ai-code-block"><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
        continue;
      }

      if (isTableHeaderCandidate(trimmed, lines[i + 1])) {
        closeList();
        var headers = splitTableRow(trimmed);
        i += 2;
        var rows = [];

        while (i < lines.length) {
          var rowLine = lines[i].trim();
          if (!rowLine || rowLine.indexOf('|') === -1) break;
          rows.push(splitTableRow(rowLine));
          i += 1;
        }
        i -= 1;

        var tableHtml = '<div class="ai-table-wrap"><table class="ai-md-table"><thead><tr>';
        headers.forEach(function (headerCell) {
          tableHtml += '<th>' + formatInlineMarkdown(headerCell) + '</th>';
        });
        tableHtml += '</tr></thead><tbody>';

        rows.forEach(function (row) {
          tableHtml += '<tr>';
          for (var c = 0; c < headers.length; c++) {
            var cellText = typeof row[c] !== 'undefined' ? row[c] : '';
            tableHtml += '<td>' + formatInlineMarkdown(cellText) + '</td>';
          }
          tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table></div>';
        html.push(tableHtml);
        continue;
      }

      var headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        closeList();
        var level = headingMatch[1].length;
        html.push('<h' + level + '>' + formatInlineMarkdown(headingMatch[2]) + '</h' + level + '>');
        continue;
      }

      var ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
      if (ulMatch) {
        if (listType !== 'ul') {
          closeList();
          listType = 'ul';
          html.push('<ul>');
        }
        html.push('<li>' + formatInlineMarkdown(ulMatch[1]) + '</li>');
        continue;
      }

      var olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (listType !== 'ol') {
          closeList();
          listType = 'ol';
          html.push('<ol>');
        }
        html.push('<li>' + formatInlineMarkdown(olMatch[1]) + '</li>');
        continue;
      }

      var quoteMatch = trimmed.match(/^>\s?(.+)$/);
      if (quoteMatch) {
        closeList();
        html.push('<blockquote>' + formatInlineMarkdown(quoteMatch[1]) + '</blockquote>');
        continue;
      }

      closeList();
      var paragraph = [trimmed];
      while (i + 1 < lines.length) {
        var nextLine = lines[i + 1];
        var nextTrimmed = nextLine.trim();
        var nextNext = i + 2 < lines.length ? lines[i + 2] : '';
        if (!nextTrimmed || isSpecialLineStart(nextTrimmed, nextNext)) break;
        paragraph.push(nextTrimmed);
        i += 1;
      }
      html.push('<p>' + paragraph.map(formatInlineMarkdown).join('<br>') + '</p>');
    }

    closeList();
    return html.join('');
  }

  function extractAIText(response) {
    if (!response) return '';
    if (typeof response.response === 'string') return response.response;
    if (typeof response.text === 'string') return response.text;
    if (typeof response.content === 'string') return response.content;
    return '';
  }

  function splitCurrencyNumber(raw) {
    var value = String(raw || '').replace(/[\u00A0\u202F\s]/g, '');
    if (!value) return null;

    var sign = '';
    if (value.charAt(0) === '-' || value.charAt(0) === '+') {
      sign = value.charAt(0);
      value = value.slice(1);
    }
    if (!value) return null;

    var hasComma = value.indexOf(',') !== -1;
    var hasDot = value.indexOf('.') !== -1;
    var decimalSeparator = '';

    if (hasComma && hasDot) {
      decimalSeparator = value.lastIndexOf(',') > value.lastIndexOf('.') ? ',' : '.';
    } else if (hasComma) {
      var commaParts = value.split(',');
      var commaLast = commaParts[commaParts.length - 1];
      decimalSeparator = commaParts.length > 1 && commaLast.length !== 3 ? ',' : '';
    } else if (hasDot) {
      var dotParts = value.split('.');
      var dotLast = dotParts[dotParts.length - 1];
      decimalSeparator = dotParts.length > 1 && dotLast.length !== 3 ? '.' : '';
    }

    var integerPart = value;
    var decimalPart = '';

    if (decimalSeparator) {
      var sepIndex = value.lastIndexOf(decimalSeparator);
      integerPart = value.slice(0, sepIndex);
      decimalPart = value.slice(sepIndex + 1);
    }

    integerPart = integerPart.replace(/[.,]/g, '');
    decimalPart = decimalPart.replace(/[.,]/g, '');

    if (!/^\d+$/.test(integerPart || '0')) return null;
    if (decimalPart && !/^\d+$/.test(decimalPart)) return null;

    integerPart = integerPart || '0';
    integerPart = integerPart.replace(/^0+(?=\d)/, '');

    return {
      sign: sign,
      integerPart: integerPart,
      decimalPart: decimalPart
    };
  }

  function formatCurrencyUS(raw) {
    var parts = splitCurrencyNumber(raw);
    if (!parts) return null;

    var groupedInteger = parts.integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var decimalSuffix = parts.decimalPart ? '.' + parts.decimalPart : '';
    return parts.sign + groupedInteger + decimalSuffix;
  }

  function normalizeCurrencyFormats(text, currencyCodes) {
    var source = String(text || '');
    if (!source || !Array.isArray(currencyCodes) || !currencyCodes.length) return source;

    var codePattern = currencyCodes.join('|');
    var numberPattern = '(\\d[\\d\\s.,\\u00A0\\u202F]*\\d|\\d)';
    var trailingCurrency = new RegExp(numberPattern + '\\s*(' + codePattern + ')\\b', 'gi');
    var leadingCurrency = new RegExp('\\b(' + codePattern + ')\\s*' + numberPattern, 'gi');

    var converted = source.replace(trailingCurrency, function (match, rawNumber, currency) {
      var normalized = formatCurrencyUS(rawNumber);
      if (!normalized) return match;
      return normalized + ' ' + currency.toUpperCase();
    });

    converted = converted.replace(leadingCurrency, function (match, currency, rawNumber) {
      var normalized = formatCurrencyUS(rawNumber);
      if (!normalized) return match;
      return currency.toUpperCase() + ' ' + normalized;
    });

    return converted;
  }

  function create(config) {
    var cfg = Object.assign({
      modalId: 'aiSummaryModal',
      closeButtonId: 'closeAiModal',
      chatWindowId: 'aiChatWindow',
      loadingRowId: 'aiLoadingRow',
      promptId: 'aiUserPrompt',
      sendButtonId: 'aiSendBtn',
      openButtonId: 'openAiModal',
      filesPanelId: 'aiFilesPanel',
      filesToggleId: 'aiFilesToggle',
      filesListId: 'aiFilesList',
      filesCountId: 'aiFilesCount',
      docsStatusId: 'aiDocsStatus',
      messagesField: 'messagesText',
      sendEndpoint: '/api/ai/send',
      includeDocsByDefault: true,
      noContextMessage: 'No case details were found.',
      docsMissingMessage: 'No document context selected.',
      chatActionName: 'chat',
      addToCaseLabel: 'Add to case',
      enableSaveAction: false,
      normalizeCurrency: false,
      currencyCodes: []
    }, config || {});

    function g(id) { return document.getElementById(id); }

    var state = {
      caseContext: null,
      cachedCaseData: null,
      cachedContextId: null,
      selectedFileKeys: null,
      loadingContext: false,
      inFlightContextPromise: null,
      conversationHistory: [],
      activeRequestController: null
    };

    function getContextId() {
      if (typeof cfg.getContextId === 'function') return cfg.getContextId();
      return null;
    }

    function getSolicitante() {
      if (typeof cfg.getSolicitante === 'function') return cfg.getSolicitante();
      return 'unknown';
    }

    function defaultFileKey(doc) {
      return String(doc.id_msg || doc.id || 0) + '|' + String(doc.filename || '').toLowerCase();
    }

    function fileKey(doc) {
      if (typeof cfg.getDocumentKey === 'function') return cfg.getDocumentKey(doc);
      return defaultFileKey(doc);
    }

    function humanBytes(n) {
      if (n == null) return '';
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function describeDocStatus(doc) {
      if (doc.status === 'ok') {
        var parts = [];
        if (doc.pages) parts.push(doc.pages + ' pg');
        if (doc.size_bytes) parts.push(humanBytes(doc.size_bytes));
        if (doc.truncated) parts.push('truncated');
        return parts.join(' · ');
      }
      var labels = {
        missing_file: 'file not found',
        skipped_size_limit: 'too large',
        skipped_unsafe_name: 'invalid name',
        skipped_global_limit: 'context limit reached',
        empty_text: 'no extractable text',
        parse_error: 'parse error'
      };
      return labels[doc.status] || doc.status || 'unavailable';
    }

    function getSelectedOkDocuments() {
      if (!state.cachedCaseData || !Array.isArray(state.cachedCaseData.documents)) return [];
      return state.cachedCaseData.documents.filter(function (doc) {
        return doc.status === 'ok' && state.selectedFileKeys && state.selectedFileKeys.has(fileKey(doc));
      });
    }

    function buildDocLabel(doc) {
      if (typeof cfg.buildDocSourceLabel === 'function') return cfg.buildDocSourceLabel(doc);
      return 'msg_id=' + String(doc.id_msg || 0);
    }

    function buildDocsTextFromSelection() {
      var docs = getSelectedOkDocuments();
      if (!docs.length) return '';
      var blocks = [];

      docs.forEach(function (doc, index) {
        var text = typeof doc.text === 'string' ? doc.text : '';
        if (!text) return;
        blocks.push('[PDF ' + (index + 1) + '] file=' + doc.filename + ' ' + buildDocLabel(doc) + '\n' + text);
      });

      return blocks.join('\n\n---\n\n');
    }

    function updateDocsStatusText() {
      var statusEl = g(cfg.docsStatusId);
      if (!statusEl) return;

      if (!state.cachedCaseData) {
        statusEl.textContent = '';
        return;
      }

      var docs = Array.isArray(state.cachedCaseData.documents) ? state.cachedCaseData.documents : [];
      var okDocs = docs.filter(function (doc) { return doc.status === 'ok'; });
      var failed = docs.length - okDocs.length;
      var included = 0;
      okDocs.forEach(function (doc) {
        if (state.selectedFileKeys && state.selectedFileKeys.has(fileKey(doc))) included++;
      });

      var note = state.cachedCaseData.documentsTruncated ? ' (truncated)' : '';
      if (!docs.length) {
        statusEl.textContent = 'No PDFs attached';
        return;
      }

      statusEl.textContent = included + '/' + okDocs.length + ' included' +
        (failed > 0 ? ', ' + failed + ' unavailable' : '') + note;
    }

    function buildCaseContext(payload) {
      var messagesText = payload && payload[cfg.messagesField] ? payload[cfg.messagesField] : '';
      var docsText = buildDocsTextFromSelection();
      if (!docsText) docsText = cfg.docsMissingMessage;

      if (typeof cfg.buildSystemPrompt === 'function') {
        return cfg.buildSystemPrompt(messagesText, docsText, payload);
      }

      var template = String(cfg.systemPromptTemplate || '{{MESSAGES}}\n\n{{DOCUMENTS}}');
      return template
        .replace('{{MESSAGES}}', messagesText)
        .replace('{{DOCUMENTS}}', docsText);
    }

    function rebuildCaseContext() {
      if (state.cachedCaseData) {
        state.caseContext = buildCaseContext(state.cachedCaseData);
      }
      updateDocsStatusText();
    }

    function renderFilesPanel(payload) {
      var panel = g(cfg.filesPanelId);
      var list = g(cfg.filesListId);
      var countEl = g(cfg.filesCountId);
      var toggle = g(cfg.filesToggleId);
      if (!panel || !list) return;

      var documents = payload && Array.isArray(payload.documents) ? payload.documents : [];
      if (!documents.length) {
        panel.hidden = true;
        list.innerHTML = '';
        updateDocsStatusText();
        return;
      }

      panel.hidden = false;
      if (countEl) countEl.textContent = documents.length;

      var shouldCollapse = documents.length > 5;
      panel.classList.toggle('ai-files-row--collapsed', shouldCollapse);
      if (toggle) toggle.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');

      list.innerHTML = '';
      documents.forEach(function (doc) {
        var li = document.createElement('li');
        var isOk = doc.status === 'ok';
        li.className = 'ai-file-item ai-file-item--' + (isOk ? 'ok' : 'disabled');

        var label = document.createElement('label');
        label.className = 'ai-file-label';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'ai-file-check';
        checkbox.dataset.key = fileKey(doc);
        if (isOk) {
          checkbox.checked = !!(state.selectedFileKeys && state.selectedFileKeys.has(fileKey(doc)));
        } else {
          checkbox.checked = false;
          checkbox.disabled = true;
        }

        checkbox.addEventListener('change', function () {
          if (!state.selectedFileKeys) state.selectedFileKeys = new Set();
          if (this.checked) state.selectedFileKeys.add(this.dataset.key);
          else state.selectedFileKeys.delete(this.dataset.key);
          rebuildCaseContext();
        });

        var name = document.createElement('span');
        name.className = 'ai-file-name';
        name.textContent = doc.filename;
        name.title = doc.filename + (isOk ? '' : ' - ' + describeDocStatus(doc));

        var meta = document.createElement('span');
        meta.className = 'ai-file-meta';
        meta.textContent = describeDocStatus(doc);

        label.appendChild(checkbox);
        label.appendChild(name);
        label.appendChild(meta);
        li.appendChild(label);
        list.appendChild(li);
      });

      updateDocsStatusText();
    }

    function fetchCaseContext(contextId, includeDocs) {
      if (typeof cfg.fetchContext === 'function') {
        return cfg.fetchContext(contextId, includeDocs);
      }

      var query = cfg.contextIdQueryParam + '=' + encodeURIComponent(contextId) +
        '&include_docs=' + (includeDocs ? '1' : '0');

      return fetch(cfg.contextEndpoint + '?' + query, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }).then(function (response) {
        if (!response.ok) {
          throw new Error('Could not load AI context (status ' + response.status + ')');
        }
        return response.json();
      }).then(function (payload) {
        if (!payload || payload.result !== 1) {
          throw new Error('Could not load AI context');
        }
        return payload;
      });
    }

    function ensureCaseContextLoaded(contextId) {
      if (!contextId) return Promise.resolve(null);

      if (state.cachedCaseData && state.cachedContextId === contextId) {
        renderFilesPanel(state.cachedCaseData);
        rebuildCaseContext();
        return Promise.resolve(state.cachedCaseData);
      }

      if (state.loadingContext && state.inFlightContextPromise) {
        return state.inFlightContextPromise;
      }

      state.loadingContext = true;
      var panel = g(cfg.filesPanelId);
      if (panel) panel.classList.add('ai-files-row--loading');
      var statusEl = g(cfg.docsStatusId);
      if (statusEl) statusEl.textContent = 'Loading document context...';

      state.inFlightContextPromise = fetchCaseContext(contextId, cfg.includeDocsByDefault)
        .then(function (payload) {
          state.cachedCaseData = payload;
          state.cachedContextId = contextId;
          state.selectedFileKeys = new Set();

          (payload.documents || []).forEach(function (doc) {
            if (doc.status === 'ok') state.selectedFileKeys.add(fileKey(doc));
          });

          renderFilesPanel(payload);
          rebuildCaseContext();
          return payload;
        })
        .catch(function (error) {
          console.error('[AI Assistant] context load error:', error);
          if (statusEl) statusEl.textContent = 'Could not load document context';
          return null;
        })
        .then(function (result) {
          state.loadingContext = false;
          state.inFlightContextPromise = null;
          if (panel) panel.classList.remove('ai-files-row--loading');
          return result;
        });

      return state.inFlightContextPromise;
    }

    function scrollChatToBottom() {
      var win = g(cfg.chatWindowId);
      if (win) win.scrollTop = win.scrollHeight;
    }

    function setBubbleContent(contentEl, role, text) {
      var value = String(text || '');
      if (role === 'user' || value.indexOf('⚠️') === 0) {
        contentEl.textContent = value;
        return;
      }
      contentEl.innerHTML = renderMarkdownToHtml(value);
    }

    function setLoading(active) {
      var row = g(cfg.loadingRowId);
      var btn = g(cfg.sendButtonId);
      if (row) row.style.display = active ? 'flex' : 'none';
      if (btn) btn.disabled = active;
    }

    function saveToCase(text, button, logId) {
      if (!cfg.enableSaveAction || !cfg.saveEndpoint || typeof cfg.buildSavePayload !== 'function') {
        return;
      }

      var payload = cfg.buildSavePayload(text, logId);
      if (!payload) return;

      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>Saving...';

      if (global.$ && typeof global.$.ajax === 'function') {
        global.$.ajax({
          url: cfg.saveEndpoint,
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify(payload)
        }).then(function () {
          button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:4px;"></i>Added to case';
          button.classList.add('saved');
          if (typeof cfg.onSaveSuccess === 'function') cfg.onSaveSuccess(payload);
        }).fail(function () {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-plus-circle" style="margin-right:4px;"></i>' + cfg.addToCaseLabel;
        });
        return;
      }

      fetch(cfg.saveEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          if (!response.ok) throw new Error('Save failed');
          return response.json();
        })
        .then(function () {
          button.innerHTML = '<i class="fas fa-check-circle" style="margin-right:4px;"></i>Added to case';
          button.classList.add('saved');
          if (typeof cfg.onSaveSuccess === 'function') cfg.onSaveSuccess(payload);
        })
        .catch(function () {
          button.disabled = false;
          button.innerHTML = '<i class="fas fa-plus-circle" style="margin-right:4px;"></i>' + cfg.addToCaseLabel;
        });
    }

    function appendActionRow(text, logId) {
      if (!cfg.enableSaveAction) return null;

      var win = g(cfg.chatWindowId);
      if (!win) return null;

      var actionsRow = document.createElement('div');
      actionsRow.className = 'ai-bubble-actions';

      var saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'ai-save-btn';
      saveBtn.innerHTML = '<i class="fas fa-plus-circle" style="margin-right:4px;"></i>' + cfg.addToCaseLabel;
      saveBtn.addEventListener('click', function () {
        saveToCase(text, saveBtn, logId || null);
      });

      actionsRow.appendChild(saveBtn);
      win.appendChild(actionsRow);
      scrollChatToBottom();
      return actionsRow;
    }

    function createBubble(role, text, options) {
      var opts = options || {};
      var win = g(cfg.chatWindowId);
      if (!win) return null;

      var outer = document.createElement('div');
      outer.className = 'ai-bubble ai-bubble--' + (role === 'user' ? 'user' : 'bot');

      var avatar = document.createElement('div');
      avatar.className = 'ai-bubble__avatar';

      if (role === 'user') {
        var userId = getSolicitante();
        if (userId && userId !== 'unknown') {
          var img = document.createElement('img');
          img.src = 'pic/' + userId + '.png';
          img.title = userId;
          img.alt = userId;
          img.style.cssText = 'width:32px;height:32px;border-radius:50%;object-fit:cover;';
          img.onerror = function () {
            this.style.display = 'none';
            this.parentNode.textContent = '👤';
          };
          avatar.appendChild(img);
        } else {
          avatar.textContent = '👤';
        }
      } else {
        avatar.textContent = '🤖';
      }

      var content = document.createElement('div');
      content.className = 'ai-bubble__content';
      setBubbleContent(content, role, text);

      outer.appendChild(avatar);
      outer.appendChild(content);
      win.appendChild(outer);

      var actionsRow = null;
      if (role === 'bot' && !opts.skipActions && String(text || '').indexOf('⚠️') !== 0) {
        actionsRow = appendActionRow(String(text || ''), opts.logId || null);
      }

      scrollChatToBottom();
      return { outer: outer, content: content, actionsRow: actionsRow };
    }

    function appendBubble(role, text, logId) {
      return createBubble(role, text, { logId: logId });
    }

    function buildPrompt(userMessage) {
      var parts = [state.caseContext || '', ''];
      state.conversationHistory.forEach(function (turn) {
        parts.push((turn.role === 'user' ? 'User' : 'Assistant') + ': ' + turn.content);
      });
      parts.push('User: ' + userMessage);
      parts.push('Assistant:');
      return parts.join('\n');
    }

    function buildSendPayload(prompt, action, stream) {
      if (typeof cfg.buildSendPayload === 'function') {
        return cfg.buildSendPayload(prompt, action, stream, getContextId(), getSolicitante());
      }

      return {
        model: cfg.model || 'gpt-oss:20b',
        prompt: prompt,
        stream: !!stream,
        accion: action || cfg.chatActionName,
        solicitante: getSolicitante()
      };
    }

    function sendToAI(prompt, action, signal) {
      return fetch(cfg.sendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: signal,
        body: JSON.stringify(buildSendPayload(prompt, action, false))
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('AI server returned status ' + response.status);
          }
          return response.json();
        })
        .then(function (payload) {
          var logId = payload && payload.log_id ? payload.log_id : null;
          var text = extractAIText(payload);
          if (!text) throw new Error('Unexpected response format from AI server');
          return { text: text, log_id: logId };
        });
    }

    function sendToAIStream(prompt, action, handlers, signal) {
      return fetch(cfg.sendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: signal,
        body: JSON.stringify(buildSendPayload(prompt, action, true))
      }).then(async function (response) {
        if (!response.ok) {
          throw new Error('AI stream returned status ' + response.status);
        }

        var contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (!response.body || contentType.indexOf('application/json') >= 0) {
          var payload = await response.json();
          var text = extractAIText(payload);
          if (handlers && handlers.onToken && text) handlers.onToken(text);
          return { text: text, log_id: payload.log_id || null };
        }

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var fullText = '';
        var finalLogId = null;

        function processLine(line) {
          if (!line) return;
          var normalized = line.indexOf('data:') === 0 ? line.slice(5).trim() : line;
          if (!normalized || normalized === '[DONE]') return;

          var parsed;
          try {
            parsed = JSON.parse(normalized);
          } catch (_) {
            fullText += normalized;
            if (handlers && handlers.onToken) handlers.onToken(normalized);
            return;
          }

          if (parsed.type === 'error') {
            throw new Error(parsed.message || 'AI stream error');
          }

          if (parsed.type === 'meta') {
            if (parsed.log_id) finalLogId = parsed.log_id;
            if (handlers && handlers.onMeta) handlers.onMeta(parsed);
            return;
          }

          if (parsed.type === 'token') {
            var token = String(parsed.token || '');
            if (!token) return;
            fullText += token;
            if (handlers && handlers.onToken) handlers.onToken(token);
            return;
          }

          if (parsed.type === 'done') {
            if (typeof parsed.text === 'string') fullText = parsed.text;
            if (parsed.log_id) finalLogId = parsed.log_id;
            return;
          }

          var fallbackToken = extractAIText(parsed);
          if (fallbackToken) {
            fullText += fallbackToken;
            if (handlers && handlers.onToken) handlers.onToken(fallbackToken);
          }
        }

        while (true) {
          var chunk = await reader.read();
          if (chunk.done) break;

          buffer += decoder.decode(chunk.value, { stream: true });
          var newlineIndex = buffer.indexOf('\n');
          while (newlineIndex !== -1) {
            var line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            processLine(line);
            newlineIndex = buffer.indexOf('\n');
          }
        }

        var tail = buffer.trim();
        if (tail) processLine(tail);

        return { text: fullText, log_id: finalLogId };
      });
    }

    async function dispatchMessage(userMessage, action) {
      appendBubble('user', userMessage);

      var prompt = buildPrompt(userMessage);
      var streamBubble = createBubble('bot', '', { skipActions: true });
      if (!streamBubble) return;
      streamBubble.content.classList.add('is-streaming');

      var aiText = '';
      var currentLogId = null;
      var requestController = new AbortController();
      state.activeRequestController = requestController;

      try {
        try {
          var streamResult = await sendToAIStream(
            prompt,
            action || cfg.chatActionName,
            {
              onMeta: function (meta) {
                if (meta && meta.log_id) currentLogId = meta.log_id;
              },
              onToken: function (token) {
                aiText += token;
                setBubbleContent(streamBubble.content, 'bot', aiText);
                scrollChatToBottom();
              }
            },
            requestController.signal
          );

          if (!aiText && streamResult && streamResult.text) aiText = streamResult.text;
          if (streamResult && streamResult.log_id) currentLogId = streamResult.log_id;
        } catch (streamError) {
          if (streamError && streamError.name === 'AbortError') throw streamError;

          if (!aiText) {
            var fallback = await sendToAI(prompt, action || cfg.chatActionName, requestController.signal);
            aiText = fallback.text;
            currentLogId = fallback.log_id || currentLogId;
            setBubbleContent(streamBubble.content, 'bot', aiText);
            scrollChatToBottom();
          }
        }

        if (!aiText) throw new Error('Empty AI response');

        if (cfg.normalizeCurrency) {
          aiText = normalizeCurrencyFormats(aiText, cfg.currencyCodes || []);
        }

        streamBubble.content.classList.remove('is-streaming');
        setBubbleContent(streamBubble.content, 'bot', aiText);

        if (String(aiText).indexOf('⚠️') !== 0) {
          streamBubble.actionsRow = appendActionRow(aiText, currentLogId);
        }

        state.conversationHistory.push({ role: 'user', content: userMessage });
        state.conversationHistory.push({ role: 'assistant', content: aiText });
      } catch (error) {
        if (error && error.name === 'AbortError') {
          if (!aiText && streamBubble.outer && streamBubble.outer.parentNode) {
            streamBubble.outer.parentNode.removeChild(streamBubble.outer);
          }
          return;
        }

        console.error('[AI Assistant]', error);
        if (aiText) {
          streamBubble.content.classList.remove('is-streaming');
          setBubbleContent(streamBubble.content, 'bot', aiText);
          if (String(aiText).indexOf('⚠️') !== 0) {
            streamBubble.actionsRow = appendActionRow(aiText, currentLogId);
          }
          state.conversationHistory.push({ role: 'user', content: userMessage });
          state.conversationHistory.push({ role: 'assistant', content: aiText });
        } else {
          if (streamBubble.outer && streamBubble.outer.parentNode) {
            streamBubble.outer.parentNode.removeChild(streamBubble.outer);
          }
          appendBubble('bot', '⚠️ An error occurred while contacting the AI server. Please try again.');
        }
      } finally {
        if (state.activeRequestController === requestController) {
          state.activeRequestController = null;
        }
        setLoading(false);
      }
    }

    function withCaseContext(contextId, cb) {
      if (state.cachedCaseData && state.cachedContextId === contextId) {
        rebuildCaseContext();
        cb();
        return;
      }

      ensureCaseContextLoaded(contextId)
        .then(function (payload) {
          if (!payload) {
            appendBubble('bot', '⚠️ Could not load case context. Please try again.');
            setLoading(false);
            return;
          }

          var messagesText = payload[cfg.messagesField] || '';
          if (!messagesText) {
            appendBubble('bot', '⚠️ ' + cfg.noContextMessage);
            setLoading(false);
            return;
          }

          cb();
        });
    }

    function handleSend(overrideText) {
      var contextId = getContextId();
      if (!contextId) {
        appendBubble('bot', '⚠️ Could not determine the case ID.');
        return;
      }

      var textarea = g(cfg.promptId);
      var userMessage = (overrideText !== undefined ? overrideText : (textarea ? textarea.value : '')).trim();
      if (!userMessage) return;

      if (textarea && overrideText === undefined) textarea.value = '';

      setLoading(true);
      withCaseContext(contextId, function () {
        dispatchMessage(userMessage, cfg.chatActionName);
      });
    }

    function handleSuggestion(action) {
      if (!cfg.suggestions || !cfg.suggestions[action]) return;
      var contextId = getContextId();
      if (!contextId) {
        appendBubble('bot', '⚠️ Could not determine the case ID.');
        return;
      }

      setLoading(true);
      withCaseContext(contextId, function () {
        dispatchMessage(cfg.suggestions[action], action);
      });
    }

    function openModal() {
      var overlay = g(cfg.modalId);
      if (!overlay) return;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';

      var contextId = getContextId();
      if (contextId) ensureCaseContextLoaded(contextId);
      else updateDocsStatusText();
    }

    /**
     * Abre el asistente centrado en UN archivo concreto: restringe la
     * seleccion de documentos a ese archivo y, opcionalmente, lanza la
     * pregunta de inmediato.
     *
     * Lo usan los menus de acciones de cada archivo (Approvals y CRM), donde
     * la pregunta es siempre sobre el documento de esa fila, no sobre todo
     * el expediente.
     *
     * @param {object} options
     * @param {string} options.filename   nombre exacto del archivo
     * @param {string|number} [options.msgId] mensaje al que pertenece (CRM)
     * @param {string} [options.prompt]   pregunta a enviar
     * @param {string} [options.action]   accion registrada en el log
     * @param {boolean} [options.send=true] false para dejar el prompt escrito
     *                                      en el input sin enviarlo
     */
    function openForDocument(options) {
      var opts = options || {};
      var filename = String(opts.filename || '');
      if (!filename) return;

      openModal();

      var contextId = getContextId();
      if (!contextId) {
        appendBubble('bot', '⚠️ Could not determine the case ID.');
        return;
      }

      setLoading(true);
      ensureCaseContextLoaded(contextId).then(function (payload) {
        if (!payload) {
          appendBubble('bot', '⚠️ Could not load case context. Please try again.');
          setLoading(false);
          return;
        }

        var documents = Array.isArray(payload.documents) ? payload.documents : [];
        var target = null;
        for (var i = 0; i < documents.length; i++) {
          var doc = documents[i];
          if (String(doc.filename || '') !== filename) continue;
          // En CRM el mismo nombre puede repetirse en distintos mensajes.
          if (opts.msgId != null && String(doc.id_msg || '') !== String(opts.msgId)) continue;
          target = doc;
          break;
        }

        if (!target) {
          appendBubble('bot', '⚠️ "' + filename + '" is not available as AI context for this case.');
          setLoading(false);
          return;
        }
        if (target.status !== 'ok') {
          appendBubble('bot', '⚠️ The text of "' + filename + '" could not be read' +
            (target.error ? ' (' + target.error + ')' : '') + '.');
          setLoading(false);
          return;
        }

        // Solo ese documento entra en el contexto, para que la respuesta no
        // se mezcle con el resto de adjuntos del expediente.
        state.selectedFileKeys = new Set([fileKey(target)]);
        renderFilesPanel(payload);
        rebuildCaseContext();

        if (!opts.prompt) {
          setLoading(false);
          var input = g(cfg.promptId);
          if (input) input.focus();
          return;
        }

        if (opts.send === false) {
          setLoading(false);
          var textarea = g(cfg.promptId);
          if (textarea) {
            textarea.value = opts.prompt;
            textarea.focus();
          }
          return;
        }

        dispatchMessage(opts.prompt, opts.action || cfg.chatActionName);
      });
    }

    function closeModal() {
      var overlay = g(cfg.modalId);
      if (overlay) overlay.classList.remove('open');
      document.body.style.overflow = '';

      if (state.activeRequestController) {
        state.activeRequestController.abort();
        state.activeRequestController = null;
      }

      setLoading(false);
    }

    document.addEventListener('DOMContentLoaded', function () {
      var openBtn = g(cfg.openButtonId);
      var closeBtn = g(cfg.closeButtonId);
      var sendBtn = g(cfg.sendButtonId);
      var overlay = g(cfg.modalId);
      var textarea = g(cfg.promptId);
      var filesToggle = g(cfg.filesToggleId);

      if (openBtn) openBtn.addEventListener('click', openModal);
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (sendBtn) sendBtn.addEventListener('click', function () { handleSend(); });

      if (overlay) {
        overlay.addEventListener('click', function (event) {
          if (event.target === overlay) closeModal();
        });
      }

      if (textarea) {
        textarea.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSend();
          }
        });
      }

      if (filesToggle) {
        filesToggle.addEventListener('click', function () {
          var panel = g(cfg.filesPanelId);
          if (!panel) return;
          var collapsed = panel.classList.toggle('ai-files-row--collapsed');
          filesToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        });
      }

      document.querySelectorAll('.ai-suggestion-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          handleSuggestion(this.getAttribute('data-action'));
        });
      });
    });

    return {
      open: openModal,
      close: closeModal,
      handleSend: handleSend,
      openForDocument: openForDocument
    };
  }

  global.AIAssistantCore = {
    create: create,
    renderMarkdownToHtml: renderMarkdownToHtml
  };
}(window));
