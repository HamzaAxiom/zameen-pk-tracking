/**
 * Popup Dashboard Controller for Zameen Property Contact Tracker
 */

document.addEventListener('DOMContentLoaded', async () => {
  let allListings = {};
  let currentFilter = 'all';
  let searchQuery = '';

  // DOM Elements
  const listingsContainer = document.getElementById('listingsContainer');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const tabButtons = document.querySelectorAll('.tab-btn');

  // Stats
  const statTotal = document.getElementById('statTotal');
  const statContacted = document.getElementById('statContacted');
  const statFollowup = document.getElementById('statFollowup');

  // Settings Elements
  const settingsDrawer = document.getElementById('settingsDrawer');
  const btnSettingsToggle = document.getElementById('btnSettingsToggle');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const settingAutoMark = document.getElementById('settingAutoMark');
  const settingDim = document.getElementById('settingDim');
  const settingBorder = document.getElementById('settingBorder');
  const settingBadge = document.getElementById('settingBadge');
  
  // Cloud Sync Elements
  const cloudStatusBadge = document.getElementById('cloudStatusBadge');
  const settingFirebaseSync = document.getElementById('settingFirebaseSync');
  const settingFirebaseUrl = document.getElementById('settingFirebaseUrl');
  const btnTestFirebase = document.getElementById('btnTestFirebase');
  const btnManualSync = document.getElementById('btnManualSync');
  const firebaseStatusMsg = document.getElementById('firebaseStatusMsg');

  // Export / Backup Elements
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnExportJson = document.getElementById('btnExportJson');
  const importFileInput = document.getElementById('importFileInput');
  const btnClearData = document.getElementById('btnClearData');

  // Load Data
  await loadData();
  await loadSettings();

  // Listen to storage changes
  ZameenStorage.onChanged(({ type, newValue }) => {
    if (type === 'listings') {
      allListings = newValue;
      updateStats();
      renderListings();
    } else if (type === 'settings') {
      updateCloudBadge(newValue);
    }
  });

  async function loadData() {
    allListings = await ZameenStorage.getAllListings();
    updateStats();
    renderListings();
  }

  async function loadSettings() {
    const settings = await ZameenStorage.getSettings();
    settingAutoMark.checked = !!settings.autoMarkOnContact;
    settingDim.checked = !!settings.dimContactedCards;
    settingBorder.checked = !!settings.highlightBorder;
    settingBadge.checked = !!settings.showBadges;
    settingFirebaseSync.checked = !!settings.firebaseSyncEnabled;
    settingFirebaseUrl.value = settings.firebaseUrl || '';
    updateCloudBadge(settings);
  }

  function updateCloudBadge(settings) {
    if (cloudStatusBadge) {
      if (settings.firebaseSyncEnabled && settings.firebaseUrl) {
        cloudStatusBadge.className = 'cloud-status-badge';
        cloudStatusBadge.innerHTML = '<span class="cloud-dot"></span> Synced';
        cloudStatusBadge.title = 'Live synced with Firebase';
      } else {
        cloudStatusBadge.className = 'cloud-status-badge disconnected';
        cloudStatusBadge.innerHTML = '<span class="cloud-dot"></span> Local Only';
        cloudStatusBadge.title = 'Cloud sync is disabled';
      }
    }
  }

  // Update Stats
  function updateStats() {
    const items = Object.values(allListings);
    statTotal.textContent = items.length;
    statContacted.textContent = items.filter(i => (i.status || 'contacted') === 'contacted').length;
    statFollowup.textContent = items.filter(i => i.status === 'followup').length;
  }

  // Render Listings
  function renderListings() {
    listingsContainer.innerHTML = '';
    const items = Object.values(allListings);

    // Sort newest contacted first
    items.sort((a, b) => new Date(b.contactedAt || 0) - new Date(a.contactedAt || 0));

    // Filter by tab
    const filtered = items.filter(item => {
      if (currentFilter !== 'all') {
        const itemStatus = item.status || 'contacted';
        if (itemStatus !== currentFilter) return false;
      }

      // Filter by search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesId = (item.id || '').toLowerCase().includes(q);
        const matchesTitle = (item.title || '').toLowerCase().includes(q);
        const matchesLoc = (item.location || '').toLowerCase().includes(q);
        const matchesNote = (item.note || '').toLowerCase().includes(q);
        if (!matchesId && !matchesTitle && !matchesLoc && !matchesNote) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      listingsContainer.style.display = 'none';
      if (searchQuery || currentFilter !== 'all') {
        emptyState.querySelector('.empty-title').textContent = 'No matching plots';
        emptyState.querySelector('.empty-desc').textContent = 'Try changing your search terms or filter tabs.';
      } else {
        emptyState.querySelector('.empty-title').textContent = 'No contacted plots yet';
        emptyState.querySelector('.empty-desc').innerHTML = 'Browse plots on <strong>Zameen.com</strong> and click <strong>"Mark Contacted"</strong> or tap the <strong>WhatsApp/Call</strong> buttons to track them!';
      }
    } else {
      emptyState.style.display = 'none';
      listingsContainer.style.display = 'flex';

      filtered.forEach(item => {
        listingsContainer.appendChild(createCardElement(item));
      });
    }
  }

  function createCardElement(item) {
    const card = document.createElement('div');
    card.className = 'listing-card';
    card.dataset.id = item.id;

    const status = item.status || 'contacted';
    const relativeTime = formatRelativeTime(item.contactedAt);

    // Image thumbnail or fallback
    const thumbHtml = item.thumbnail
      ? `<img src="${escapeHtml(item.thumbnail)}" class="listing-thumb" alt="Plot photo" onerror="this.outerHTML='<div class=\\'listing-thumb-fallback\\'>🏡</div>'"/>`
      : `<div class="listing-thumb-fallback">🏡</div>`;

    card.innerHTML = `
      <div class="listing-header">
        ${thumbHtml}
        <div class="listing-details">
          <a href="${escapeHtml(item.url)}" target="_blank" class="listing-title" title="${escapeHtml(item.title)}">
            ${escapeHtml(item.title)}
          </a>
          <div class="listing-meta-row">
            <span class="listing-price">${escapeHtml(item.price || 'PKR N/A')}</span>
            ${item.area ? `<span class="listing-area">${escapeHtml(item.area)}</span>` : ''}
          </div>
          <div class="listing-location" title="${escapeHtml(item.location)}">
            📍 ${escapeHtml(item.location || 'Islamabad')}
          </div>
        </div>
      </div>

      ${item.note ? `<div class="listing-note">📝 <strong>Note:</strong> ${escapeHtml(item.note)}</div>` : ''}

      <div class="listing-footer">
        <span class="status-badge ${status}">${status}</span>
        <span class="contact-time">${item.contactMethod ? `${item.contactMethod} • ` : ''}${relativeTime}</span>
        <div class="card-actions">
          <button class="btn-card-action btn-edit-note" title="Edit note">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
          </button>
          <button class="btn-card-action btn-cycle-status" title="Change status">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/></svg>
          </button>
          <button class="btn-card-action btn-delete" title="Remove from tracker">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          </button>
        </div>
      </div>
    `;

    // Action button listeners
    card.querySelector('.btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Remove plot #${item.id} from your contacted list?`)) {
        await ZameenStorage.removeListing(item.id);
        delete allListings[item.id];
        updateStats();
        renderListings();
      }
    });

    card.querySelector('.btn-cycle-status').addEventListener('click', async (e) => {
      e.stopPropagation();
      const statusCycle = ['contacted', 'followup', 'rejected'];
      const nextIndex = (statusCycle.indexOf(item.status || 'contacted') + 1) % statusCycle.length;
      const nextStatus = statusCycle[nextIndex];
      await ZameenStorage.saveListing({ ...item, status: nextStatus });
    });

    card.querySelector('.btn-edit-note').addEventListener('click', async (e) => {
      e.stopPropagation();
      const currentNote = item.note || '';
      const promptText = prompt('Enter note / demand details for this plot:', currentNote);
      if (promptText !== null) {
        await ZameenStorage.saveListing({ ...item, note: promptText.trim() });
      }
    });

    return card;
  }

  // Search input handler
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    btnClearSearch.style.display = searchQuery ? 'block' : 'none';
    renderListings();
  });

  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    btnClearSearch.style.display = 'none';
    renderListings();
  });

  // Filter tabs
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderListings();
    });
  });

  // Settings Drawer Toggle
  btnSettingsToggle.addEventListener('click', () => {
    settingsDrawer.style.display = 'flex';
  });
  btnCloseSettings.addEventListener('click', () => {
    settingsDrawer.style.display = 'none';
  });

  // Save Settings on switch change
  [settingAutoMark, settingDim, settingBorder, settingBadge, settingFirebaseSync].forEach(toggle => {
    toggle.addEventListener('change', async () => {
      await ZameenStorage.saveSettings({
        autoMarkOnContact: settingAutoMark.checked,
        dimContactedCards: settingDim.checked,
        highlightBorder: settingBorder.checked,
        showBadges: settingBadge.checked,
        firebaseSyncEnabled: settingFirebaseSync.checked,
        firebaseUrl: settingFirebaseUrl.value.trim()
      });
    });
  });

  settingFirebaseUrl.addEventListener('change', async () => {
    await ZameenStorage.saveSettings({
      firebaseUrl: settingFirebaseUrl.value.trim(),
      firebaseSyncEnabled: settingFirebaseSync.checked
    });
  });

  // Test Firebase Connection
  btnTestFirebase.addEventListener('click', async () => {
    const rawUrl = settingFirebaseUrl.value.trim();
    if (!rawUrl) {
      firebaseStatusMsg.className = 'sync-status-msg error';
      firebaseStatusMsg.textContent = 'Please enter a Firebase URL';
      return;
    }

    firebaseStatusMsg.className = 'sync-status-msg';
    firebaseStatusMsg.textContent = 'Testing connection...';

    const cleanUrl = ZameenStorage.cleanFirebaseUrl(rawUrl);
    try {
      const res = await fetch(`${cleanUrl}/listings.json`);
      if (res.ok) {
        firebaseStatusMsg.className = 'sync-status-msg success';
        firebaseStatusMsg.textContent = '✓ Connected successfully to Firebase!';
        await ZameenStorage.saveSettings({
          firebaseUrl: cleanUrl,
          firebaseSyncEnabled: true
        });
        settingFirebaseSync.checked = true;
      } else {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err) {
      firebaseStatusMsg.className = 'sync-status-msg error';
      firebaseStatusMsg.textContent = 'Connection failed: ' + err.message;
    }
  });

  // Manual Sync Now
  btnManualSync.addEventListener('click', async () => {
    btnManualSync.textContent = 'Syncing...';
    try {
      allListings = await ZameenStorage.pullAllFromFirebase();
      updateStats();
      renderListings();
      firebaseStatusMsg.className = 'sync-status-msg success';
      firebaseStatusMsg.textContent = '✓ All listings synced with cloud!';
    } catch (err) {
      firebaseStatusMsg.className = 'sync-status-msg error';
      firebaseStatusMsg.textContent = 'Sync failed: ' + err.message;
    } finally {
      btnManualSync.textContent = 'Sync Now';
    }
  });

  // Export to CSV
  btnExportCsv.addEventListener('click', () => {
    const items = Object.values(allListings);
    if (items.length === 0) {
      alert('No contacted plots to export yet!');
      return;
    }

    const headers = ['Property ID', 'Title', 'Price', 'Location', 'Area', 'Status', 'Contact Method', 'Contacted Date', 'Notes', 'URL'];
    const rows = items.map(item => [
      `"${(item.id || '').replace(/"/g, '""')}"`,
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${(item.price || '').replace(/"/g, '""')}"`,
      `"${(item.location || '').replace(/"/g, '""')}"`,
      `"${(item.area || '').replace(/"/g, '""')}"`,
      `"${(item.status || 'contacted').replace(/"/g, '""')}"`,
      `"${(item.contactMethod || 'Manual').replace(/"/g, '""')}"`,
      `"${(item.contactedAt || '').replace(/"/g, '""')}"`,
      `"${(item.note || '').replace(/"/g, '""')}"`,
      `"${(item.url || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    downloadFile(csvContent, `zameen_contacted_plots_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  });

  // Backup Data (JSON)
  btnExportJson.addEventListener('click', () => {
    const jsonStr = JSON.stringify(allListings, null, 2);
    downloadFile(jsonStr, `zameen_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  });

  // Restore Backup
  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (typeof data !== 'object') throw new Error('Invalid format');
        for (const [id, listing] of Object.entries(data)) {
          if (listing && listing.id) {
            await ZameenStorage.saveListing(listing);
          }
        }
        alert('Backup restored successfully!');
        settingsDrawer.style.display = 'none';
        await loadData();
      } catch (err) {
        alert('Failed to import file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Clear All Data
  btnClearData.addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete ALL tracked listings? This cannot be undone.')) {
      await ZameenStorage.clearAllListings();
      allListings = {};
      updateStats();
      renderListings();
      settingsDrawer.style.display = 'none';
    }
  });

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffSecs = Math.floor((now - date) / 1000);

    if (diffSecs < 60) return 'Just now';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
