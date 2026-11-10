(() => {
  'use strict';

  const BUTTON_CLASS = 'gmail-copy-recipients';
  const ADVANCED_CLASS = 'gmail-copy-recipients-advanced';
  const DETAILS_SELECTOR = '.ajA, table';
  const EMAIL_PATTERN = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi;
  let scanQueued = false;
  let copying = false;
  let lastEditedDraft = null;

  function addressesFrom(value) {
    return value?.match(EMAIL_PATTERN) || [];
  }

  function unique(addresses) {
    const seen = new Set();
    return addresses.filter(address => {
      const key = address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function recipientRows(root) {
    const rows = root.querySelectorAll('tr');
    const addresses = [];
    for (const row of rows) {
      const cells = row.querySelectorAll(':scope > td, :scope > th');
      if (cells.length < 2 || !/^\s*(to|cc|bcc)\s*:?\s*$/i.test(cells[0].textContent || '')) continue;
      for (const cell of Array.from(cells).slice(1)) {
        const marked = cell.querySelectorAll('[email], [data-email], a[href^="mailto:"]');
        for (const element of marked) {
          addresses.push(...addressesFrom(element.getAttribute('email')));
          addresses.push(...addressesFrom(element.getAttribute('data-email')));
          addresses.push(...addressesFrom(element.getAttribute('href')));
        }
        // Gmail can render plain addresses without an email attribute.
        addresses.push(...addressesFrom(cell.textContent));
      }
    }
    return unique(addresses);
  }

  function visibleDetails() {
    return Array.from(document.querySelectorAll(DETAILS_SELECTOR)).filter(element =>
      element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden'
    );
  }

  function waitForDetails(previous) {
    return new Promise(resolve => {
      let observer;
      let timer;
      const finish = value => {
        observer.disconnect();
        clearTimeout(timer);
        resolve(value);
      };
      const check = () => {
        const details = visibleDetails().find(element => !previous.has(element) && recipientRows(element).length);
        if (details) finish(details);
      };
      observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
      timer = setTimeout(() => finish(null), 1500);
      check();
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const field = document.createElement('textarea');
      field.value = text;
      field.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      if (!copied) throw new Error('Clipboard access failed');
    }
  }

  const TO_SELECTOR = 'input[name="to"], textarea[name="to"], input[aria-label="To recipients"], input[aria-label="To"], textarea[aria-label="To"], [data-recipient-type="to"] input, [data-recipient-type="to"] textarea';
  const EDITOR_SELECTOR = '[contenteditable="true"][role="textbox"]';

  function draftFor(element) {
    const draft = element.closest('.M9') || element.closest('.AD') || element.closest('[role="dialog"]');
    return draft && (draft.querySelector(TO_SELECTOR) || draft.querySelector(EDITOR_SELECTOR)) ? draft : null;
  }

  function openDrafts() {
    const drafts = new Set();
    document.querySelectorAll(`${TO_SELECTOR}, ${EDITOR_SELECTOR}`).forEach(element => {
      const draft = draftFor(element);
      if (draft && draft.getClientRects().length && getComputedStyle(draft).visibility !== 'hidden' && !draft.closest('[aria-hidden="true"]')) drafts.add(draft);
    });
    return [...drafts];
  }

  function mostRecentlyEditedDraft() {
    const drafts = openDrafts();
    if (lastEditedDraft && drafts.includes(lastEditedDraft)) return lastEditedDraft;
    return drafts.length === 1 ? drafts[0] : null;
  }

  function addToDraft(draft, addresses) {
    if (!draft.isConnected) throw new Error('The selected draft was closed');
    const input = [...draft.querySelectorAll(TO_SELECTOR)].find(field => field.getClientRects().length && !field.disabled && !field.readOnly);
    if (!input || input.disabled || input.readOnly) throw new Error('Draft To field is unavailable');

    const before = input.value;
    const suffix = `${before.trim() && !/[ ,;]$/.test(before.trimEnd()) ? ', ' : ''}${addresses.join(', ')}`;
    input.focus();
    input.setSelectionRange(before.length, before.length);
    const inserted = document.execCommand('insertText', false, suffix);
    if (!inserted || input.value === before) {
      const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(input, before + suffix);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    const body = draft.querySelector(EDITOR_SELECTOR);
    if (body) {
      body.focus();
      const range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(false);
      const selection = body.ownerDocument.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function recordDraftEdit(event) {
    if (!(event.target instanceof Element)) return;
    const draft = draftFor(event.target);
    if (draft) lastEditedDraft = draft;
  }

  document.addEventListener('input', recordDraftEdit, true);
  document.addEventListener('change', recordDraftEdit, true);

  const ICONS = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    advanced: '<path d="M5 5l7 7-7 7M12 5l7 7-7 7"/>',
    success: '<path d="m4 12 5 5L20 6"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>'
  };
  const DEFAULT_LABELS = {
    copy: 'Copy recipient email addresses',
    advanced: 'Copy addresses to the latest edited draft'
  };

  function showStatus(button, state, label) {
    button.dataset.state = state;
    button.firstElementChild.innerHTML = ICONS[state];
    button.title = label;
    button.setAttribute('aria-label', label);
    clearTimeout(button.statusTimer);
    button.statusTimer = setTimeout(() => {
      if (!button.isConnected) return;
      button.dataset.state = 'copy';
      button.firstElementChild.innerHTML = ICONS[button.dataset.action];
      button.title = DEFAULT_LABELS[button.dataset.action];
      button.setAttribute('aria-label', DEFAULT_LABELS[button.dataset.action]);
    }, 2200);
  }

  async function handleCopy(button, arrow, buttons) {
    if (button.disabled || copying) return;
    copying = true;
    buttons.forEach(item => { item.disabled = true; });
    const previous = new Set(visibleDetails());
    const draft = button.dataset.action === 'advanced' ? mostRecentlyEditedDraft() : null;
    let opened = false;
    let copied = false;
    try {
      arrow.click();
      opened = true;
      const details = await waitForDetails(previous);
      if (!details) throw new Error('Recipient details did not open');
      const addresses = recipientRows(details);
      if (!addresses.length) throw new Error('No recipient addresses found');
      await copyText(addresses.join(', '));
      copied = true;
      if (visibleDetails().some(element => !previous.has(element) && recipientRows(element).length)) arrow.click();
      opened = false;
      if (button.dataset.action === 'advanced') {
        if (!draft) throw new Error('Open one draft, or edit the intended draft first');
        addToDraft(draft, addresses);
        showStatus(button, 'success', `Copied ${addresses.length} addresses to clipboard and draft`);
      } else {
        showStatus(button, 'success', `Copied ${addresses.length} recipient addresses`);
      }
    } catch (error) {
      console.warn('Email-py:', error);
      showStatus(button, 'error', button.dataset.action === 'advanced'
        ? (copied ? `Addresses copied; ${error.message}` : 'Could not copy recipient addresses')
        : 'Could not copy recipient addresses');
    } finally {
      // Close only the details panel opened by this click.
      if (opened && visibleDetails().some(element => !previous.has(element) && recipientRows(element).length)) arrow.click();
      copying = false;
      buttons.forEach(item => { item.disabled = false; });
    }
  }

  function createButton(action, arrow, buttons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action === 'advanced' ? `${BUTTON_CLASS} ${ADVANCED_CLASS}` : BUTTON_CLASS;
    button.dataset.action = action;
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[action]}</svg>`;
    button.title = DEFAULT_LABELS[action];
    button.setAttribute('aria-label', DEFAULT_LABELS[action]);
    button.addEventListener('click', event => {
      event.stopPropagation();
      handleCopy(button, arrow, buttons);
    });
    buttons.push(button);
    return button;
  }

  function addButtons() {
    // Gmail has used both .ajy (the dropdown control) and .ajz (its
    // inner button) for this control. Prefer the outer control when nested.
    const selectors = '.ajy, .ajz, [aria-label*="Show details" i], [data-tooltip*="Show details" i]';
    document.querySelectorAll(selectors).forEach(candidate => {
      const arrow = candidate.closest('.ajy') || candidate;
      const message = arrow.closest('.adn, [data-message-id]');
      if (!message || !message.querySelector('.hb, .gE')) return;
      if (arrow.nextElementSibling?.classList.contains(BUTTON_CLASS)) return;
      // Avoid placing the icon on an unrelated details control in the body.
      if (!arrow.closest('.gE, .hb, .gS, .gF') && !arrow.matches('.ajy, .ajz')) return;
      const buttons = [];
      const copy = createButton('copy', arrow, buttons);
      const advanced = createButton('advanced', arrow, buttons);
      arrow.insertAdjacentElement('afterend', copy);
      copy.insertAdjacentElement('afterend', advanced);
    });
  }

  const observer = new MutationObserver(records => {
    if (records.every(record => record.target instanceof Element && record.target.closest(`.${BUTTON_CLASS}`))) return;
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      addButtons();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  addButtons();
})();
