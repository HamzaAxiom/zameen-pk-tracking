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
          refreshAllDetailBars();
        } else if (type === 'settings') {
          userSettings = newValue;
          applyBodySettings();
          refreshAllCards();
          refreshAllDetailBars();
        }
      });

      // Initial card scan
      processListings();

      // If on a property detail page, inject the detail action bars
      initDetailPage();

      // Watch for dynamically loaded listings (infinite scroll/filtering/pagination)
      setupObserver();

      // Watch for client-side SPA navigation
      setupRouteWatcher();
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
    if (!data || !data.id) {
      // Clean up detail bars if user navigated away from a property page
      document.querySelectorAll('.zt-detail-header-bar, .zt-detail-sidebar-bar, .zt-detail-floating-bar').forEach(el => el.remove());
      return;
    }

    injectDetailHeaderBar(data);
    injectDetailSidebarBar(data);
    updateDetailFloatingBar(data);
    setupDetailContactListeners(data);
  }

  function refreshAllDetailBars() {
    const data = ZameenExtractor.extractFromDetailPage();
    if (!data || !data.id) return;
    injectDetailHeaderBar(data);
    injectDetailSidebarBar(data);
    updateDetailFloatingBar(data);
  }

  /**
   * 1. Inject Prominent Inline Action Bar right under Property Title / Header
   */
  function injectDetailHeaderBar(data) {
    const tracked = trackedListings[data.id];
    let bar = document.querySelector('.zt-detail-header-bar');

    if (!bar) {
      // Find optimal insertion anchor in the header area
      // Target: .c121f914 contains h1.aea614fd and div.cd230541 (location)
      const headerContainer = document.querySelector('.c121f914, div._301c67f2');
      const h1El = document.querySelector('h1.aea614fd, h1');

      if (!headerContainer && !h1El) return;

      bar = document.createElement('div');
      bar.className = 'zt-detail-header-bar';
      bar.addEventListener('click', (e) => e.stopPropagation());
      bar.addEventListener('mousedown', (e) => e.stopPropagation());

      const locEl = headerContainer ? headerContainer.querySelector('.cd230541, [aria-label="Property header"]') : null;
      if (locEl && locEl.parentNode) {
        locEl.parentNode.insertBefore(bar, locEl.nextSibling);
      } else if (headerContainer) {
        headerContainer.appendChild(bar);
      } else if (h1El && h1El.parentNode) {
        h1El.parentNode.insertBefore(bar, h1El.nextSibling);
      }
    }

    renderDetailBarContent(bar, data, tracked, 'header');
  }

  /**
   * 2. Inject Action Bar directly in Sidebar Agency Contact Box
   */
  function injectDetailSidebarBar(data) {
    const tracked = trackedListings[data.id];
    let bar = document.querySelector('.zt-detail-sidebar-bar');

    if (!bar) {
      // Target: ._45f31597 (Agency contact form container) or .a328e85c
      const sidebarContainer = document.querySelector('div._45f31597, .a328e85c, [aria-label="Agency contact form"]');
      if (!sidebarContainer) return;

      bar = document.createElement('div');
      bar.className = 'zt-detail-sidebar-bar';
      bar.addEventListener('click', (e) => e.stopPropagation());
      bar.addEventListener('mousedown', (e) => e.stopPropagation());

      const form = sidebarContainer.querySelector('form.ab8ae9d8, form');
      if (form && form.parentNode) {
        form.parentNode.insertBefore(bar, form);
      } else {
        sidebarContainer.insertBefore(bar, sidebarContainer.firstChild);
      }
    }

    renderDetailBarContent(bar, data, tracked, 'sidebar');
  }

  /**
   * 3. Update or inject Bottom Floating Bar
   */
  function updateDetailFloatingBar(data) {
    const tracked = trackedListings[data.id];
    let bar = document.querySelector('.zt-detail-floating-bar');

    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'zt-detail-floating-bar';
      bar.addEventListener('click', (e) => e.stopPropagation());
      bar.addEventListener('mousedown', (e) => e.stopPropagation());
      document.body.appendChild(bar);
    }

    renderDetailBarContent(bar, data, tracked, 'floating');
  }

  /**
   * Render internal interactive HTML for any detail bar
   */
  function renderDetailBarContent(bar, data, tracked, barType) {
    const isContacted = !!tracked;
    const currentStatus = (tracked && tracked.status) || 'contacted';
    const statusText = tracked ? formatBadgeText(tracked) : 'Not Contacted';
    const hasNote = tracked && tracked.note && tracked.note.trim().length > 0;
    const relativeTime = tracked && tracked.contactedAt ? formatRelativeTime(tracked.contactedAt) : '';

    bar.innerHTML = `
      <div class="zt-detail-bar-inner zt-detail-bar-${barType}">
        <div class="zt-detail-left">
          <span class="zt-brand-pill">
            <svg viewBox="0 0 20 20" class="zt-logo-icon"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>
            Tracker
          </span>
          <span class="zt-status-pill zt-status-${isContacted ? currentStatus : 'uncontacted'}">
            ${isContacted ? `${ICONS.check} ${statusText}` : '○ Not Contacted'}
          </span>
          ${relativeTime ? `<span class="zt-contacted-time" title="${new Date(tracked.contactedAt).toLocaleString()}">${relativeTime}</span>` : ''}
        </div>

        <div class="zt-detail-actions">
          <button type="button" class="zt-btn zt-detail-toggle-btn ${isContacted ? `zt-btn-${currentStatus}` : 'zt-btn-mark'}">
            ${isContacted ? `${ICONS.check} ${statusText}` : `${ICONS.plus} Mark Contacted`}
          </button>

          <select class="zt-status-select zt-detail-status-select" style="display: ${isContacted ? 'inline-block' : 'none'};">
            <option value="contacted" ${currentStatus === 'contacted' ? 'selected' : ''}>✓ Contacted</option>
            <option value="followup" ${currentStatus === 'followup' ? 'selected' : ''}>⏳ Follow-up</option>
            <option value="rejected" ${currentStatus === 'rejected' ? 'selected' : ''}>✕ Passed</option>
            <option value="unmark">↺ Unmark</option>
          </select>

          <button type="button" class="zt-btn zt-btn-note ${hasNote ? 'has-note' : ''}">
            ${ICONS.note} <span>${hasNote ? 'Note' : 'Add Note'}</span>
          </button>
        </div>

        ${hasNote ? `
          <div class="zt-detail-note-preview" title="Click 'Note' button to edit">
            <span class="zt-note-label">Note:</span> "${tracked.note}"
          </div>
        ` : ''}
      </div>
    `;

    // 1. Toggle Contacted Button
    const toggleBtn = bar.querySelector('.zt-detail-toggle-btn');
    toggleBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const current = trackedListings[data.id];
      if (current) {
        delete trackedListings[data.id];
        refreshAllDetailBars();
        await ZameenStorage.removeListing(data.id);
        showToast(`Removed #${data.id} from contacted`, 'info', async () => {
          trackedListings[data.id] = current;
          refreshAllDetailBars();
          await ZameenStorage.saveListing(current);
        });
      } else {
        const newListing = {
          ...data,
          status: 'contacted',
          contactMethod: 'Manual',
          contactedAt: new Date().toISOString()
        };
        trackedListings[data.id] = newListing;
        refreshAllDetailBars();
        await ZameenStorage.saveListing(newListing);
        showToast(`✓ Marked #${data.id} as Contacted!`, 'success', async () => {
          delete trackedListings[data.id];
          refreshAllDetailBars();
          await ZameenStorage.removeListing(data.id);
        });
      }
    });

    // 2. Status Dropdown
    const statusSelect = bar.querySelector('.zt-detail-status-select');
    statusSelect.addEventListener('change', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const newStatus = e.target.value;
      if (newStatus === 'unmark') {
        const current = trackedListings[data.id];
        delete trackedListings[data.id];
        refreshAllDetailBars();
        await ZameenStorage.removeListing(data.id);
        showToast(`Removed #${data.id} from contacted`, 'info', async () => {
          if (current) {
            trackedListings[data.id] = current;
            refreshAllDetailBars();
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
        refreshAllDetailBars();
        await ZameenStorage.saveListing(updated);
        showToast(`Status updated to: ${newStatus}`);
      }
    });

    // 3. Note Button
    const noteBtn = bar.querySelector('.zt-btn-note');
    noteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDetailNotePopover(bar, data);
    });
  }

  /**
   * Detail Note Popover
   */
  function toggleDetailNotePopover(bar, data) {
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
        <span>Property #${data.id} Note</span>
        <button class="zt-note-popover-close" type="button">✕</button>
      </div>
      <textarea class="zt-note-textarea" placeholder="Owner's demand, agent name, phone, or plot details...">${tracked.note || ''}</textarea>
      <div class="zt-note-popover-actions">
        <button class="zt-btn-save-note" type="button">Save Note</button>
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
      refreshAllDetailBars();
      await ZameenStorage.saveListing(updated);
      popover.remove();
      showToast(`Note saved for #${data.id}`);
    });

    bar.appendChild(popover);
    popover.querySelector('textarea').focus();
  }

  /**
   * Auto-contact triggers for Detail Page Call / Email / WhatsApp buttons
   */
  function setupDetailContactListeners(data) {
    if (document.body.dataset.ztDetailBound === data.id) return;
    document.body.dataset.ztDetailBound = data.id;

    // Call buttons on page
    document.querySelectorAll('button[aria-label="Call"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleDetailContactAction(data, 'Call');
      });
    });

    // Send email button on agency form
    document.querySelectorAll('button[aria-label="Send email"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleDetailContactAction(data, 'Email');
      });
    });

    // WhatsApp share links
    document.querySelectorAll('a[title="Share on WhatsApp"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleDetailContactAction(data, 'WhatsApp');
      });
    });
  }

  async function handleDetailContactAction(data, method) {
    if (!userSettings.autoMarkOnContact) return;
    const existing = trackedListings[data.id];
    if (!existing) {
      const newListing = {
        ...data,
        status: 'contacted',
        contactMethod: method,
        contactedAt: new Date().toISOString()
      };
      trackedListings[data.id] = newListing;
      refreshAllDetailBars();
      await ZameenStorage.saveListing(newListing);
      showToast(`✓ Marked #${data.id} as Contacted via ${method}!`, 'success', async () => {
        delete trackedListings[data.id];
        refreshAllDetailBars();
        await ZameenStorage.removeListing(data.id);
      });
    }
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
   * Setup MutationObserver for dynamically loaded listings & SPA detail views
   */
  function setupObserver() {
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        processListings();
        initDetailPage();
      }, 250);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Watch for SPA route / URL changes (HTML5 history API)
   */
  function setupRouteWatcher() {
    let lastUrl = location.href;
    const checkUrlChange = () => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(() => {
          processListings();
          initDetailPage();
        }, 150);
      }
    };

    window.addEventListener('popstate', checkUrlChange);

    const origPushState = history.pushState;
    history.pushState = function () {
      origPushState.apply(this, arguments);
      checkUrlChange();
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function () {
      origReplaceState.apply(this, arguments);
      checkUrlChange();
    };
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
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
