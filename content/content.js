/**
 * Content Script for Zameen Property Contact Tracker
 * Injects status buttons, badges, notes, and auto-contact triggers into Zameen.com
 */

(function () {
  'use strict';

  let trackedListings = {};
  let userSettings = {
    autoMarkOnContact: true,
    dimContactedCards: false,
    highlightBorder: true,
    showBadges: true
  };

  // SVG Icons
  const ICONS = {
    check: `<svg viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>`,
    plus: `<svg viewBox="0 0 20 20"><path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"/></svg>`,
    note: `<svg viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>`
  };

  /**
   * Initialize extension on page
   */
  async function init() {
    try {
      trackedListings = await ZameenStorage.getAllListings();
      userSettings = await ZameenStorage.getSettings();
      applyBodySettings();

      // Listen for background / popup changes
      ZameenStorage.onChanged(({ type, newValue }) => {
        if (type === 'listings') {
          trackedListings = newValue;
          refreshAllCards();
          updateDetailPageBar();
        } else if (type === 'settings') {
          userSettings = newValue;
          applyBodySettings();
          refreshAllCards();
        }
      });

      // Initial card scan
      processListings();

      // If on a property detail page, inject the floating bar
      initDetailPage();

      // Watch for dynamically loaded listings (infinite scroll/filtering/pagination)
      setupObserver();
    } catch (err) {
      console.error('[Zameen Tracker] Error initializing:', err);
    }
  }

  function applyBodySettings() {
    if (userSettings.dimContactedCards) {
      document.body.classList.add('zt-dim-contacted');
    } else {
      document.body.classList.remove('zt-dim-contacted');
    }
  }

  /**
   * Process all listing cards found on the page
   */
  function processListings() {
    const cards = document.querySelectorAll(
      'li[role="article"], article._5b98ebdf, [aria-label="Listing"]'
    );

    cards.forEach((card) => {
      const link = card.querySelector('a[aria-label="Listing link"], a[href*="/Property/"]');
      if (!link) return;

      const data = ZameenExtractor.extractFromCard(card);
      if (!data || !data.id) return;

      decorateCard(card, data);
    });
  }

  /**
   * Decorate a single listing card
   */
  function decorateCard(card, data) {
    card.dataset.ztId = data.id;
    const tracked = trackedListings[data.id];

    // Update card styling based on status
    updateCardStatusClasses(card, tracked ? tracked.status : null);

    // Update or inject Top Badge
    let topBadge = card.querySelector('.zt-top-badge');
    if (tracked && userSettings.showBadges) {
      if (!topBadge) {
        topBadge = document.createElement('div');
        card.appendChild(topBadge);
      }
      topBadge.className = `zt-top-badge zt-badge-${tracked.status || 'contacted'}`;
      topBadge.innerHTML = `${ICONS.check} ${formatBadgeText(tracked)}`;
    } else if (topBadge) {
      topBadge.remove();
    }

    // Update or inject In-Card Action Bar
    let actionBar = card.querySelector('.zameen-tracker-action-bar');
    if (!actionBar) {
      actionBar = createActionBar(card, data);

      // Locate details column (right side of card)
      const detailsCol = card.querySelector('.d3b6a76b, ._43afd188');
      const contactRow = card.querySelector('._30dd3799');

      if (contactRow && contactRow.parentNode) {
        contactRow.parentNode.insertBefore(actionBar, contactRow.nextSibling);
      } else if (detailsCol) {
        detailsCol.appendChild(actionBar);
      } else {
        card.appendChild(actionBar);
      }
    } else {
      updateActionBarState(actionBar, tracked);
    }

    // Attach auto-mark click listener to Call and WhatsApp buttons
    setupContactListeners(card, data);
  }

  function updateCardStatusClasses(card, status) {
    card.classList.remove('zt-card-contacted', 'zt-card-followup', 'zt-card-rejected');
    if (status && userSettings.highlightBorder) {
      card.classList.add(`zt-card-${status}`);
    }
  }

  function formatBadgeText(tracked) {
    if (tracked.status === 'followup') return 'Follow-up';
    if (tracked.status === 'rejected') return 'Passed';
    return 'Contacted';
  }

  /**
   * Create the Action Bar for a listing card
   */
  function createActionBar(card, data) {
    const bar = document.createElement('div');
    bar.className = 'zameen-tracker-action-bar';

    // Stop click and mousedown from bubbling to card anchor link
    bar.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    bar.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    const tracked = trackedListings[data.id];

    // 1. Main Action / Status Button
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'zt-btn zt-toggle-btn';
    updateToggleBtn(toggleBtn, tracked);

    toggleBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const current = trackedListings[data.id];
      if (current) {
        // Toggle off / unmark
        delete trackedListings[data.id];
        decorateCard(card, data);
        await ZameenStorage.removeListing(data.id);
        showToast(`Removed #${data.id} from contacted`, 'info', async () => {
          trackedListings[data.id] = current;
          decorateCard(card, data);
          await ZameenStorage.saveListing(current);
        });
      } else {
        // Mark contacted
        const newListing = {
          ...data,
          status: 'contacted',
          contactMethod: 'Manual',
          contactedAt: new Date().toISOString()
        };
        trackedListings[data.id] = newListing;
        decorateCard(card, data);
        await ZameenStorage.saveListing(newListing);
        showToast(`✓ Marked #${data.id} as Contacted!`, 'success', async () => {
          delete trackedListings[data.id];
          decorateCard(card, data);
          await ZameenStorage.removeListing(data.id);
        });
      }
    });

    // 2. Status Selector Dropdown (visible when contacted)
    const statusSelect = document.createElement('select');
    statusSelect.className = 'zt-status-select';
    statusSelect.innerHTML = `
      <option value="contacted">✓ Contacted</option>
      <option value="followup">⏳ Follow-up</option>
      <option value="rejected">✕ Passed</option>
      <option value="unmark">↺ Unmark</option>
    `;
    statusSelect.value = (tracked && tracked.status) || 'contacted';
    statusSelect.style.display = tracked ? 'inline-block' : 'none';

    statusSelect.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    statusSelect.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    statusSelect.addEventListener('change', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const newStatus = e.target.value;
      if (newStatus === 'unmark') {
        const current = trackedListings[data.id];
        delete trackedListings[data.id];
        decorateCard(card, data);
        await ZameenStorage.removeListing(data.id);
        showToast(`Removed #${data.id} from contacted`, 'info', async () => {
          if (current) {
            trackedListings[data.id] = current;
            decorateCard(card, data);
            await ZameenStorage.saveListing(current);
          }
        });
      } else {
        const current = trackedListings[data.id] || { ...data };
        const updated = {
          ...current,
          status: newStatus
        };
        trackedListings[data.id] = updated;
        decorateCard(card, data);
        await ZameenStorage.saveListing(updated);
        showToast(`Status updated to: ${newStatus}`);
      }
    });

    // 3. Quick Note Button
    const noteBtn = document.createElement('button');
    noteBtn.type = 'button';
    noteBtn.className = `zt-btn zt-btn-note ${tracked && tracked.note ? 'has-note' : ''}`;
    noteBtn.innerHTML = `${ICONS.note} <span>${tracked && tracked.note ? 'Note' : 'Add Note'}</span>`;

    noteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleNotePopover(bar, data, card);
    });

    bar.appendChild(toggleBtn);
    bar.appendChild(statusSelect);
    bar.appendChild(noteBtn);

    return bar;
  }

  function updateActionBarState(bar, tracked) {
    const toggleBtn = bar.querySelector('.zt-toggle-btn');
    if (toggleBtn) updateToggleBtn(toggleBtn, tracked);

    const statusSelect = bar.querySelector('.zt-status-select');
    if (statusSelect) {
      statusSelect.style.display = tracked ? 'inline-block' : 'none';
      if (tracked) statusSelect.value = tracked.status || 'contacted';
    }

    const noteBtn = bar.querySelector('.zt-btn-note');
    if (noteBtn) {
      noteBtn.className = `zt-btn zt-btn-note ${tracked && tracked.note ? 'has-note' : ''}`;
      noteBtn.querySelector('span').textContent = (tracked && tracked.note) ? 'Note' : 'Add Note';
    }
  }

  function updateToggleBtn(btn, tracked) {
    if (tracked) {
      if (tracked.status === 'followup') {
        btn.className = 'zt-btn zt-toggle-btn zt-btn-followup';
        btn.innerHTML = `${ICONS.check} <span>Follow-up</span>`;
        btn.title = 'Click to unmark or toggle';
      } else if (tracked.status === 'rejected') {
        btn.className = 'zt-btn zt-toggle-btn zt-btn-rejected';
        btn.innerHTML = `<span>Passed</span>`;
        btn.title = 'Click to unmark or toggle';
      } else {
        btn.className = 'zt-btn zt-toggle-btn zt-btn-contacted';
        btn.innerHTML = `${ICONS.check} <span>Contacted</span>`;
        btn.title = 'Click to unmark';
      }
    } else {
      btn.className = 'zt-btn zt-toggle-btn zt-btn-mark';
      btn.innerHTML = `${ICONS.plus} <span>Mark Contacted</span>`;
      btn.title = 'Mark this listing as contacted';
    }
  }

  /**
   * Note Popover inline
   */
  function toggleNotePopover(bar, data, card) {
    const existing = bar.querySelector('.zt-note-popover');
    if (existing) {
      existing.remove();
      return;
    }

    const tracked = trackedListings[data.id] || {};
    const popover = document.createElement('div');
    popover.className = 'zt-note-popover';

    popover.addEventListener('click', (e) => e.stopPropagation());
    popover.addEventListener('mousedown', (e) => e.stopPropagation());

    popover.innerHTML = `
      <div class="zt-note-popover-header">
        <span>Plot #${data.id} Note</span>
        <button class="zt-note-popover-close" type="button">✕</button>
      </div>
      <textarea class="zt-note-textarea" placeholder="Demand price, agent name, or plot details...">${tracked.note || ''}</textarea>
      <div class="zt-note-popover-actions">
        <button class="zt-btn-save-note" type="button">Save</button>
      </div>
    `;

    const closeBtn = popover.querySelector('.zt-note-popover-close');
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      popover.remove();
    });

    const saveBtn = popover.querySelector('.zt-btn-save-note');
    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = popover.querySelector('.zt-note-textarea').value.trim();
      const current = trackedListings[data.id] || {
        ...data,
        status: 'contacted',
        contactedAt: new Date().toISOString()
      };
      const updated = {
        ...current,
        note: text
      };
      trackedListings[data.id] = updated;
      decorateCard(card, data);
      await ZameenStorage.saveListing(updated);
      popover.remove();
      showToast(`Note saved for #${data.id}`);
    });

    bar.appendChild(popover);
    popover.querySelector('textarea').focus();
  }

  /**
   * Auto-mark when clicking WhatsApp / Call
   */
  function setupContactListeners(card, data) {
    if (card.dataset.ztListenersAttached === 'true') return;
    card.dataset.ztListenersAttached = 'true';

    const whatsappBtn = card.querySelector('button[aria-label="Whatsapp"], a[aria-label="Whatsapp"]');
    if (whatsappBtn) {
      whatsappBtn.addEventListener('click', () => {
        handleContactAction(card, data, 'WhatsApp');
      });
    }

    const callBtn = card.querySelector('button[aria-label="Call"]');
    if (callBtn) {
      callBtn.addEventListener('click', () => {
        handleContactAction(card, data, 'Call');
      });
    }
  }

  async function handleContactAction(card, data, method) {
    if (!userSettings.autoMarkOnContact) return;

    // Save as contacted if not already saved
    const existing = trackedListings[data.id];
    if (!existing) {
      const newListing = {
        ...data,
        status: 'contacted',
        contactMethod: method,
        contactedAt: new Date().toISOString()
      };
      trackedListings[data.id] = newListing;
      decorateCard(card, data);
      await ZameenStorage.saveListing(newListing);
      showToast(`✓ Marked #${data.id} as Contacted via ${method}!`, 'success', async () => {
        delete trackedListings[data.id];
        decorateCard(card, data);
        await ZameenStorage.removeListing(data.id);
      });
    }
  }

  /**
   * Detail Page Support (when viewing a specific property)
   */
  function initDetailPage() {
    const data = ZameenExtractor.extractFromDetailPage();
    if (!data || !data.id) return;

    updateDetailPageBar();

    // Hook WhatsApp / Call buttons on detail page
    document.querySelectorAll('button[aria-label="Whatsapp"], button[aria-label="Call"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const method = btn.getAttribute('aria-label') || 'Call';
        const cardLike = document.body;
        handleContactAction(cardLike, data, method);
      });
    });
  }

  function updateDetailPageBar() {
    const data = ZameenExtractor.extractFromDetailPage();
    if (!data || !data.id) return;

    let bar = document.querySelector('.zt-detail-floating-bar');
    const tracked = trackedListings[data.id];

    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'zt-detail-floating-bar';
      bar.addEventListener('click', (e) => e.stopPropagation());
      document.body.appendChild(bar);
    }

    bar.innerHTML = `
      <div class="zt-detail-info">
        <span class="zt-detail-info-title">Zameen Tracker: ID #${data.id}</span>
        <span class="zt-detail-info-sub">${tracked ? `Status: ${tracked.status.toUpperCase()}` : 'Status: Not Contacted'}</span>
      </div>
      <button type="button" class="zt-btn zt-detail-toggle-btn ${tracked ? 'zt-btn-contacted' : 'zt-btn-mark'}">
        ${tracked ? `${ICONS.check} Contacted` : `${ICONS.plus} Mark Contacted`}
      </button>
    `;

    const btn = bar.querySelector('.zt-detail-toggle-btn');
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const current = trackedListings[data.id];
      if (current) {
        delete trackedListings[data.id];
        updateDetailPageBar();
        await ZameenStorage.removeListing(data.id);
        showToast(`Removed #${data.id} from contacted`);
      } else {
        const newListing = {
          ...data,
          status: 'contacted',
          contactMethod: 'Manual',
          contactedAt: new Date().toISOString()
        };
        trackedListings[data.id] = newListing;
        updateDetailPageBar();
        await ZameenStorage.saveListing(newListing);
        showToast(`✓ Marked #${data.id} as Contacted!`);
      }
    });
  }

  /**
   * Refresh all cards on DOM when storage updates
   */
  function refreshAllCards() {
    const cards = document.querySelectorAll('li[role="article"], article._5b98ebdf');
    cards.forEach((card) => {
      const id = card.dataset.ztId;
      if (!id) return;
      const tracked = trackedListings[id];
      updateCardStatusClasses(card, tracked ? tracked.status : null);

      const bar = card.querySelector('.zameen-tracker-action-bar');
      if (bar) {
        updateActionBarState(bar, tracked);
      }

      let topBadge = card.querySelector('.zt-top-badge');
      if (tracked && userSettings.showBadges) {
        if (!topBadge) {
          topBadge = document.createElement('div');
          card.appendChild(topBadge);
        }
        topBadge.className = `zt-top-badge zt-badge-${tracked.status || 'contacted'}`;
        topBadge.innerHTML = `${ICONS.check} ${formatBadgeText(tracked)}`;
      } else if (topBadge) {
        topBadge.remove();
      }
    });
  }

  /**
   * Setup MutationObserver for dynamically loaded listings
   */
  function setupObserver() {
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        processListings();
      }, 300);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Toast notifications
   */
  function showToast(message, type = 'info', undoCallback = null) {
    let container = document.querySelector('.zt-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'zt-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `zt-toast zt-toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;

    if (undoCallback) {
      const undoBtn = document.createElement('button');
      undoBtn.className = 'zt-toast-undo-btn';
      undoBtn.textContent = 'Undo';
      undoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        undoCallback();
        toast.remove();
      });
      toast.appendChild(undoBtn);
    }

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => toast.remove(), 250);
      }
    }, 4000);
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
