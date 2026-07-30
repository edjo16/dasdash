/**
 * Whitelist-based HTML sanitizer.
 * Allows safe formatting tags from the rich textarea editor while
 * stripping script injection, event handlers, and dangerous elements.
 */

const ALLOWED_TAGS = new Set([
  'b', 'strong', 'u', 'i', 'em', 'p', 'br', 'span',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'div', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'font'
]);

const ALLOWED_ATTRS = {
  'span': ['style'],
  'td': ['style', 'colspan', 'rowspan'],
  'th': ['style', 'colspan', 'rowspan'],
  'table': ['style'],
  'div': ['style'],
  'p': ['style'],
  'b': ['style'],
  'strong': ['style'],
  'u': ['style'],
  'i': ['style'],
  'em': ['style'],
  'font': ['color'],
};

const SAFE_STYLE_PROPS = new Set([
  'color', 'background-color', 'font-weight', 'font-style', 'text-decoration',
  'text-align', 'border', 'border-collapse', 'padding', 'margin',
  'width', 'height', 'vertical-align'
]);

const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea',
  'select', 'button', 'link', 'meta', 'style', 'base', 'applet',
  'noscript', 'noembed', 'svg', 'math', 'video', 'audio', 'source',
  'img', 'a', 'frame', 'frameset', 'portal'
]);

function sanitizeStyle(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const props = raw.split(';').filter(Boolean);
  const safe = [];
  for (const prop of props) {
    const colonIdx = prop.indexOf(':');
    if (colonIdx < 0) continue;
    const name = prop.slice(0, colonIdx).trim().toLowerCase();
    const value = prop.slice(colonIdx + 1).trim();
    if (SAFE_STYLE_PROPS.has(name) && !/expression\(|javascript:|url\(/i.test(value)) {
      safe.push(name + ': ' + value);
    }
  }
  return safe.join('; ');
}

function stripTags(html) {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<[^>]*>/g, '');
}

function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';

  let result = '';
  let i = 0;

  while (i < html.length) {
    if (html[i] === '<') {
      const closeIdx = html.indexOf('>', i);
      if (closeIdx < 0) {
        result += '&lt;';
        break;
      }

      const tagContent = html.slice(i + 1, closeIdx);
      const isClosing = tagContent[0] === '/';
      const isSelfClosing = tagContent[tagContent.length - 1] === '/';
      const tagMatch = tagContent.replace(/^\//, '').replace(/\/$/, '').trim().match(/^([a-zA-Z][a-zA-Z0-9]*)/);

      if (!tagMatch) {
        result += '&lt;';
        i++;
        continue;
      }

      const tagName = tagMatch[1].toLowerCase();

      if (DANGEROUS_TAGS.has(tagName)) {
        i = closeIdx + 1;
        continue;
      }

      if (!ALLOWED_TAGS.has(tagName)) {
        i = closeIdx + 1;
        continue;
      }

      if (isClosing) {
        result += '</' + (tagName === 'font' ? 'span' : tagName) + '>';
        i = closeIdx + 1;
        continue;
      }

      let attrs = '';
      const allowedAttrs = ALLOWED_ATTRS[tagName] || [];
      const attrRegex = /([a-zA-Z\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
      let attrMatch;
      let attrStr = tagContent.slice(tagName.length);
      let fontColor = null;

      while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
        const attrName = attrMatch[1].toLowerCase();
        const attrValue = attrMatch[2] || attrMatch[3] || attrMatch[4] || '';

        if (attrName.startsWith('on')) continue;

        if (tagName === 'font' && attrName === 'color') {
          fontColor = attrValue;
          continue;
        }

        if (attrName === 'style' && allowedAttrs.includes('style')) {
          const sanitized = sanitizeStyle(attrValue);
          if (sanitized) {
            attrs += ' style="' + sanitized.replace(/"/g, '&quot;') + '"';
          }
        } else if (allowedAttrs.includes(attrName)) {
          attrs += ' ' + attrName + '="' + attrValue.replace(/"/g, '&quot;') + '"';
        }
      }

      if (tagName === 'font') {
        if (fontColor) {
          const safe = sanitizeStyle('color: ' + fontColor);
          if (safe) {
            attrs = ' style="' + safe.replace(/"/g, '&quot;') + '"';
          }
        }
        result += '<span' + attrs + '>';
        i = closeIdx + 1;
        continue;
      }

      result += '<' + tagName + attrs + '>';
      i = closeIdx + 1;
    } else if (html.slice(i, i + 4) === '&lt;' || html.slice(i, i + 4) === '&gt;' || html.slice(i, i + 5) === '&amp;') {
      result += html[i];
      i++;
    } else {
      let nextTag = html.indexOf('<', i);
      if (nextTag < 0) nextTag = html.length;
      result += html.slice(i, nextTag);
      i = nextTag;
    }
  }

  return result;
}

export { sanitizeHtml, stripTags };
