/**
 * Storage and Firebase Cloud Sync utility for Zameen Property Contact Tracker
 * Keeps local chrome.storage.local and synchronizes with Firebase Realtime Database in real time.
 */

const STORAGE_KEYS = {
  LISTINGS: 'zameen_tracked_listings',
  SETTINGS: 'zameen_tracker_settings'
};

const DEFAULT_SETTINGS = {
  autoMarkOnContact: true,
  dimContactedCards: false,
  highlightBorder: true,
  showBadges: true,
  firebaseSyncEnabled: false,
  firebaseUrl: ''
};

let eventSource = null;
let isSyncingFromRemote = false;

const ZameenStorage = {
  /**
   * Get all tracked listings from local cache
   */
  async getAllListings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.LISTINGS], (result) => {
        resolve(result[STORAGE_KEYS.LISTINGS] || {});
      });
    });
  },

  /**
   * Get a single tracked listing by its ID
   */
  async getListing(id) {
    if (!id) return null;
    const listings = await this.getAllListings();
    return listings[id] || null;
  },

  /**
   * Save or update a listing (saves locally + pushes to Firebase)
   */
  async saveListing(listing) {
    if (!listing || !listing.id) {
      throw new Error('Listing must have a valid id');
    }

    const listings = await this.getAllListings();
    const existing = listings[listing.id] || {};

    const updated = {
      ...existing,
      ...listing,
      id: String(listing.id),
      status: listing.status || existing.status || 'contacted',
      contactedAt: listing.contactedAt || existing.contactedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    listings[listing.id] = updated;

    // 1. Save locally
    await new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.LISTINGS]: listings }, resolve);
    });

    // 2. Sync to Firebase Cloud if enabled (asynchronous background push)
    this.pushListingToFirebase(updated).catch(err => {
      console.warn('[Zameen Tracker] Cloud push warning:', err.message);
    });

    return updated;
  },

  /**
   * Remove a tracked listing (removes locally + deletes from Firebase)
   */
  async removeListing(id) {
    if (!id) return false;
    const listings = await this.getAllListings();
    if (listings[id]) {
      delete listings[id];
      await new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEYS.LISTINGS]: listings }, resolve);
      });

      // Delete from Firebase Cloud
      this.deleteListingFromFirebase(id).catch(err => {
        console.warn('[Zameen Tracker] Cloud delete warning:', err.message);
      });

      return true;
    }
    return false;
  },

  /**
   * Clear all tracked listings
   */
  async clearAllListings() {
    await new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.LISTINGS]: {} }, resolve);
    });

    const settings = await this.getSettings();
    if (settings.firebaseSyncEnabled && settings.firebaseUrl) {
      const url = this.cleanFirebaseUrl(settings.firebaseUrl) + '/listings.json';
      fetch(url, { method: 'DELETE' }).catch(() => {});
    }

    return true;
  },

  /**
   * Get user settings
   */
  async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (result) => {
        resolve({ ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) });
      });
    });
  },

  /**
   * Save user settings
   */
  async saveSettings(settings) {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated }, resolve);
    });

    // Restart live listener if Firebase URL or enabled status changed
    if (updated.firebaseSyncEnabled) {
      this.initLiveSync();
    } else if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    return updated;
  },

  /**
   * Clean and normalize Firebase Database URL
   */
  cleanFirebaseUrl(url) {
    if (!url) return '';
    let clean = url.trim();
    if (!clean.startsWith('http')) clean = 'https://' + clean;
    return clean.replace(/\/+$/, '');
  },

  /**
   * Push single listing to Firebase REST endpoint
   */
  async pushListingToFirebase(listing) {
    const settings = await this.getSettings();
    if (!settings.firebaseSyncEnabled || !settings.firebaseUrl) return;

    const baseUrl = this.cleanFirebaseUrl(settings.firebaseUrl);
    const url = `${baseUrl}/listings/${encodeURIComponent(listing.id)}.json`;

    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listing)
    });
  },

  /**
   * Delete single listing from Firebase REST endpoint
   */
  async deleteListingFromFirebase(id) {
    const settings = await this.getSettings();
    if (!settings.firebaseSyncEnabled || !settings.firebaseUrl) return;

    const baseUrl = this.cleanFirebaseUrl(settings.firebaseUrl);
    const url = `${baseUrl}/listings/${encodeURIComponent(id)}.json`;

    await fetch(url, { method: 'DELETE' });
  },

  /**
   * Pull all listings from Firebase and merge into local cache
   */
  async pullAllFromFirebase() {
    const settings = await this.getSettings();
    if (!settings.firebaseSyncEnabled || !settings.firebaseUrl) return null;

    const baseUrl = this.cleanFirebaseUrl(settings.firebaseUrl);
    const url = `${baseUrl}/listings.json`;

    try {
      const res = await fetch(url);
      const remoteListings = (await res.json()) || {};
      const localListings = await this.getAllListings();

      // Merge: take newer of local or remote by updatedAt/contactedAt
      const merged = { ...localListings };
      for (const [id, remoteItem] of Object.entries(remoteListings)) {
        if (!remoteItem || !remoteItem.id) continue;
        const localItem = localListings[id];
        if (!localItem) {
          merged[id] = remoteItem;
        } else {
          const remoteTime = new Date(remoteItem.updatedAt || remoteItem.contactedAt || 0).getTime();
          const localTime = new Date(localItem.updatedAt || localItem.contactedAt || 0).getTime();
          if (remoteTime >= localTime) {
            merged[id] = remoteItem;
          }
        }
      }

      isSyncingFromRemote = true;
      await new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEYS.LISTINGS]: merged }, resolve);
      });
      isSyncingFromRemote = false;

      return merged;
    } catch (err) {
      console.error('[Zameen Tracker] Error pulling from Firebase:', err);
      throw err;
    }
  },

  /**
   * Initialize Real-Time Live Sync via Server-Sent Events (SSE)
   * This pushes updates to your screen in under 500ms when your brother marks a plot!
   */
  async initLiveSync() {
    const settings = await this.getSettings();
    if (!settings.firebaseSyncEnabled || !settings.firebaseUrl) return;

    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    const baseUrl = this.cleanFirebaseUrl(settings.firebaseUrl);
    const streamUrl = `${baseUrl}/listings.json`;

    try {
      eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('put', async (e) => {
        if (isSyncingFromRemote) return;
        try {
          const payload = JSON.parse(e.data);
          const path = payload.path; // e.g. "/" or "/54596618"
          const data = payload.data;

          const localListings = await this.getAllListings();

          if (path === '/') {
            // Full replacement
            if (data && typeof data === 'object') {
              isSyncingFromRemote = true;
              await new Promise((res) => chrome.storage.local.set({ [STORAGE_KEYS.LISTINGS]: data }, res));
              isSyncingFromRemote = false;
            }
          } else {
            const id = path.replace(/^\//, '');
            if (data === null) {
              // Deleted remotely
              if (localListings[id]) {
                delete localListings[id];
                isSyncingFromRemote = true;
                await new Promise((res) => chrome.storage.local.set({ [STORAGE_KEYS.LISTINGS]: localListings }, res));
                isSyncingFromRemote = false;
              }
            } else if (data && typeof data === 'object') {
              // Added or updated remotely
              localListings[id] = { ...data, id };
              isSyncingFromRemote = true;
              await new Promise((res) => chrome.storage.local.set({ [STORAGE_KEYS.LISTINGS]: localListings }, res));
              isSyncingFromRemote = false;
            }
          }
        } catch (err) {
          console.warn('[Zameen Tracker] SSE parse error:', err);
        }
      });

      eventSource.onerror = () => {
        // EventSource will automatically retry in background
      };
    } catch (err) {
      console.warn('[Zameen Tracker] SSE connection error:', err);
    }
  },

  /**
   * Listen for local changes in storage
   */
  onChanged(callback) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        if (changes[STORAGE_KEYS.LISTINGS]) {
          callback({
            type: 'listings',
            newValue: changes[STORAGE_KEYS.LISTINGS].newValue || {},
            oldValue: changes[STORAGE_KEYS.LISTINGS].oldValue || {}
          });
        }
        if (changes[STORAGE_KEYS.SETTINGS]) {
          callback({
            type: 'settings',
            newValue: changes[STORAGE_KEYS.SETTINGS].newValue || {},
            oldValue: changes[STORAGE_KEYS.SETTINGS].oldValue || {}
          });
        }
      }
    });
  }
};

// Start live sync automatically
if (typeof window !== 'undefined') {
  window.ZameenStorage = ZameenStorage;
  // Initial sync pull & listener connection
  ZameenStorage.pullAllFromFirebase().catch(() => {});
  ZameenStorage.initLiveSync().catch(() => {});
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZameenStorage;
}
