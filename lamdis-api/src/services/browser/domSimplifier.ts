/**
 * DOM Simplifier — extracts a clean, LLM-friendly summary of a web page.
 * Runs inside page.evaluate() to extract structured data about visible elements.
 *
 * Inspired by competitor-dashboard's extractRelevantDomParts() but generalized
 * for any page type (not just social media).
 */

/** The simplified DOM output sent to the LLM */
export interface SimplifiedDOM {
  url: string;
  title: string;
  links: Array<{ text: string; href: string; selector: string }>;
  buttons: Array<{ text: string; selector: string }>;
  inputs: Array<{ name: string; type: string; placeholder: string; selector: string; value?: string; label?: string }>;
  images: Array<{ src: string; alt: string; width: number; height: number; selector: string }>;
  headings: Array<{ level: number; text: string }>;
  mainText: string;
  metaTags: Array<{ property: string; content: string }>;
  jsonLd: string[];
}

/**
 * Script to run inside page.evaluate() — extracts simplified DOM.
 * Returns a JSON-serializable object.
 */
export const DOM_SIMPLIFIER_SCRIPT = `
(() => {
  const MAX_TEXT = 3000;
  const MAX_ITEMS = 50;

  // Helper: generate a unique CSS selector for an element
  function getSelector(el) {
    if (el.id) return '#' + el.id;
    if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    if (el.getAttribute('aria-label')) return '[aria-label="' + el.getAttribute('aria-label').replace(/"/g, '\\\\"') + '"]';

    let path = el.tagName.toLowerCase();
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\\s+/).filter(c => c && !c.includes(':') && c.length < 30).slice(0, 2);
      if (classes.length) path += '.' + classes.join('.');
    }

    // Add nth-child if needed for uniqueness
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(s => s.tagName === el.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(el) + 1;
        path += ':nth-child(' + idx + ')';
      }
    }
    return path;
  }

  // Helper: is element visible?
  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetParent !== null;
  }

  const result = {
    url: window.location.href,
    title: document.title,
    links: [],
    buttons: [],
    inputs: [],
    images: [],
    headings: [],
    mainText: '',
    metaTags: [],
    jsonLd: [],
  };

  // Links (visible, with text)
  document.querySelectorAll('a[href]').forEach(a => {
    if (result.links.length >= MAX_ITEMS) return;
    if (!isVisible(a)) return;
    const text = (a.textContent || '').trim().slice(0, 80);
    const href = a.href;
    if (!text && !href) return;
    if (href.startsWith('javascript:')) return;
    result.links.push({ text, href, selector: getSelector(a) });
  });

  // Buttons
  document.querySelectorAll('button, [role="button"], input[type="submit"]').forEach(btn => {
    if (result.buttons.length >= MAX_ITEMS) return;
    if (!isVisible(btn)) return;
    const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim().slice(0, 60);
    if (!text) return;
    result.buttons.push({ text, selector: getSelector(btn) });
  });

  // Helper: find associated label text for an input
  function getLabelText(inp) {
    // 1. Explicit <label for="id">
    if (inp.id) {
      var label = document.querySelector('label[for="' + inp.id + '"]');
      if (label) return (label.textContent || '').trim().slice(0, 80);
    }
    // 2. Wrapping <label> parent
    var parent = inp.closest('label');
    if (parent) {
      var text = (parent.textContent || '').trim().slice(0, 80);
      if (text) return text;
    }
    // 3. Adjacent sibling text (common for radio/checkbox)
    var next = inp.nextSibling;
    while (next) {
      if (next.nodeType === 3) { // text node
        var t = (next.textContent || '').trim();
        if (t) return t.slice(0, 80);
      }
      if (next.nodeType === 1) { // element node
        var t2 = (next.textContent || '').trim();
        if (t2) return t2.slice(0, 80);
        break;
      }
      next = next.nextSibling;
    }
    // 4. Previous sibling text
    var prev = inp.previousSibling;
    while (prev) {
      if (prev.nodeType === 3) {
        var t3 = (prev.textContent || '').trim();
        if (t3) return t3.slice(0, 80);
      }
      if (prev.nodeType === 1) {
        var t4 = (prev.textContent || '').trim();
        if (t4) return t4.slice(0, 80);
        break;
      }
      prev = prev.previousSibling;
    }
    return '';
  }

  // Input fields
  document.querySelectorAll('input, textarea, select').forEach(inp => {
    if (result.inputs.length >= MAX_ITEMS) return;
    if (!isVisible(inp)) return;
    if (inp.type === 'hidden') return;
    var labelText = (inp.type === 'radio' || inp.type === 'checkbox') ? getLabelText(inp) : '';
    result.inputs.push({
      name: inp.name || inp.id || '',
      type: inp.type || inp.tagName.toLowerCase(),
      placeholder: inp.placeholder || inp.getAttribute('aria-label') || labelText || '',
      selector: getSelector(inp),
      value: inp.type === 'search' || inp.type === 'text' ? (inp.value || undefined) :
             (inp.type === 'radio' || inp.type === 'checkbox') ? (inp.checked ? 'checked' : undefined) : undefined,
      label: labelText || undefined,
    });
  });

  // Images (visible, with reasonable size — also check data-src for lazy-loaded images)
  document.querySelectorAll('img').forEach(img => {
    if (result.images.length >= MAX_ITEMS) return;
    if (!isVisible(img)) return;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    const src = img.src || img.getAttribute('data-src') || '';
    if (!src || src.startsWith('data:')) return;
    // Skip tiny icons, but always include CDN image thumbnails (rendered small but actual image is larger)
    if (w < 30 && h < 30) return;
    if (w < 50 && h < 50 && !/gstatic\.com|googleusercontent\.com|ggpht\.com|twimg\.com|fbcdn\.net/i.test(src)) return;
    result.images.push({
      src,
      alt: (img.alt || '').slice(0, 100),
      width: w,
      height: h,
      selector: getSelector(img),
    });
  });

  // Headings
  document.querySelectorAll('h1, h2, h3').forEach(h => {
    if (result.headings.length >= 20) return;
    const text = (h.textContent || '').trim().slice(0, 120);
    if (text) result.headings.push({ level: parseInt(h.tagName[1]), text });
  });

  // Main body text (stripped)
  const body = document.body.innerText || '';
  result.mainText = body.replace(/\\s+/g, ' ').trim().slice(0, MAX_TEXT);

  // Meta tags (og, twitter, description)
  document.querySelectorAll('meta[property], meta[name]').forEach(m => {
    const prop = m.getAttribute('property') || m.getAttribute('name') || '';
    const content = m.getAttribute('content') || '';
    if (!content) return;
    if (prop.startsWith('og:') || prop.startsWith('twitter:') || prop === 'description') {
      result.metaTags.push({ property: prop, content: content.slice(0, 300) });
    }
  });

  // JSON-LD structured data
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    const text = (s.textContent || '').trim();
    if (text.length > 0 && text.length < 10000) {
      result.jsonLd.push(text);
    }
  });

  return result;
})()
`;

/**
 * Format a SimplifiedDOM into a concise text summary for the LLM.
 */
export function formatDOMForLLM(dom: SimplifiedDOM): string {
  const lines: string[] = [];

  lines.push(`PAGE: ${dom.url}`);
  lines.push(`TITLE: ${dom.title}`);

  if (dom.headings.length > 0) {
    lines.push(`\nHEADINGS:`);
    dom.headings.forEach(h => lines.push(`  ${'#'.repeat(h.level)} ${h.text}`));
  }

  if (dom.inputs.length > 0) {
    lines.push(`\nINPUTS (${dom.inputs.length}):`);
    dom.inputs.forEach(i => {
      const desc = i.label || i.placeholder || i.name;
      const checked = i.value === 'checked' ? ' ✓' : '';
      lines.push(`  [${i.type}] ${desc}${checked} → ${i.selector}`);
    });
  }

  if (dom.buttons.length > 0) {
    lines.push(`\nBUTTONS (${dom.buttons.length}):`);
    dom.buttons.forEach(b => lines.push(`  "${b.text}" → ${b.selector}`));
  }

  if (dom.images.length > 0) {
    lines.push(`\nIMAGES (${dom.images.length}):`);
    dom.images.slice(0, 30).forEach((img, i) => {
      lines.push(`  [${i}] ${img.width}x${img.height} alt="${img.alt}" src=${img.src.slice(0, 120)} → ${img.selector}`);
    });
  }

  if (dom.links.length > 0) {
    lines.push(`\nLINKS (${dom.links.length}, showing first 30):`);
    dom.links.slice(0, 30).forEach(l => {
      if (l.text) lines.push(`  "${l.text.slice(0, 50)}" → ${l.href.slice(0, 100)}`);
    });
  }

  if (dom.metaTags.length > 0) {
    lines.push(`\nMETA:`);
    dom.metaTags.forEach(m => lines.push(`  ${m.property}: ${m.content.slice(0, 150)}`));
  }

  // Include main text for simple pages or pages with forms (forms need context)
  if (dom.mainText && (dom.links.length < 10 || dom.inputs.length > 0)) {
    lines.push(`\nPAGE TEXT (excerpt):\n${dom.mainText.slice(0, 2000)}`);
  }

  return lines.join('\n');
}
