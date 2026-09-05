/**
 * Storage utility for Zameen Property Contact Tracker
 * Uses chrome.storage.local to persist tracked listings and user preferences.
 */

const STORAGE_KEYS = {
  LISTINGS: 'zameen_tracked_listings',
  SETTINGS: 'zameen_tracker_settings'
};

const DEFAULT_SETTINGS = {
  autoMarkOnContact: true,   // Auto-mark when clicking WhatsApp/Call
  dimContactedCards: false,  // Slightly dim contacted cards to focus on new listings
  highlightBorder: true,     // Give contacted cards a green border accent
  showBadges: true           // Display contacted badge on top of cards
};

const ZameenStorage = {
  /**
   * Get all tracked listings as an object: { [id]: listingData }
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
   * Save or update a listing
   * @param {Object} listing - { id, url, title, price, location, area, thumbnail, contactedAt, status, note, contactMethod }
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

    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.LISTINGS]: listings }, () => {
        resolve(updated);
      });
    });
  },

  /**
   * Remove a tracked listing
   */
  async removeListing(id) {
    if (!id) return false;
    const listings = await this.getAllListings();
    if (listings[id]) {
      delete listings[id];
      return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEYS.LISTINGS]: listings }, () => {
          resolve(true);
        });
      });
    }
    return false;
  },

  /**
   * Clear all tracked listings
   */
  async clearAllListings() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.LISTINGS]: {} }, () => {
        resolve(true);
      });
    });
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
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated }, () => {
        resolve(updated);
      });
    });
  },

  /**
   * Listen for changes in storage
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

// Make available in both content scripts and popup environments
if (typeof window !== 'undefined') {
  window.ZameenStorage = ZameenStorage;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZameenStorage;
}
