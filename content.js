(() => {
  'use strict';

  const BUTTON_CLASS = 'gmail-copy-recipients';
  const DETAILS_SELECTOR = '.ajA, table';
  const EMAIL_PATTERN = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi;
  let scanQueued = false;

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

  const ICONS = {
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    success: '<path d="m4 12 5 5L20 6"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>'
  };
  const DEFAULT_LABEL = 'Copy recipient email addresses';

  function showStatus(button, state, label) {
    button.dataset.state = state;
    button.firstElementChild.innerHTML = ICONS[state];
    button.title = label;
    button.setAttribute('aria-label', label);
    clearTimeout(button.statusTimer);
    button.statusTimer = setTimeout(() => {
      if (!button.isConnected) return;
      button.dataset.state = 'copy';
      button.firstElementChild.innerHTML = ICONS.copy;
      button.title = DEFAULT_LABEL;
      button.setAttribute('aria-label', DEFAULT_LABEL);
    }, 2200);
  }

  async function handleCopy(button, arrow) {
    if (button.disabled) return;
    button.disabled = true;
    const previous = new Set(visibleDetails());
    let opened = false;
    try {
      arrow.click();
      opened = true;
      const details = await waitForDetails(previous);
      if (!details) throw new Error('Recipient details did not open');
      const addresses = recipientRows(details);
      if (!addresses.length) throw new Error('No recipient addresses found');
      await copyText(addresses.join(', '));
      showStatus(button, 'success', `Copied ${addresses.length} recipient addresses`);
    } catch (error) {
      console.warn('Gmail Copy Recipients:', error);
      showStatus(button, 'error', 'Could not copy recipient addresses');
    } finally {
      // Close only the details panel opened by this click.
      if (opened && visibleDetails().some(element => !previous.has(element) && recipientRows(element).length)) arrow.click();
      button.disabled = false;
    }
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
      const button = document.createElement('button');
      button.type = 'button';
      button.className = BUTTON_CLASS;
      button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS.copy}</svg>`;
      button.title = DEFAULT_LABEL;
      button.setAttribute('aria-label', DEFAULT_LABEL);
      button.addEventListener('click', event => {
        event.stopPropagation();
        handleCopy(button, arrow);
      });
      arrow.insertAdjacentElement('afterend', button);
    });
  }

  const observer = new MutationObserver(() => {
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
