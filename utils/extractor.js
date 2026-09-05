/**
 * DOM Extractor for Zameen.com
 * Handles extracting property details from search listing cards and property detail pages.
 */

const ZameenExtractor = {
  /**
   * Extract unique property ID from a URL or string
   * Examples:
   *   /Property/mpchs_multi_gardens_phase_2-54596618-20527-2.html -> 54596618
   *   /Property/islamabad_b-17-54665035-616-2.html -> 54665035
   */
  extractPropertyIdFromUrl(url) {
    if (!url) return null;
    // Common Zameen URL pattern: property_title-[propertyId]-[agencyId]-[type].html
    const match = url.match(/-(\d{6,10})(?:-\d+)*\.html/i) || url.match(/\/Property\/.*?-(\d+)/i);
    if (match && match[1]) {
      return match[1];
    }
    // Fallback: sanitized path if no numeric ID matched
    try {
      const parsed = new URL(url, 'https://www.zameen.com');
      return parsed.pathname.replace(/^\/|\/$/g, '');
    } catch {
      return url;
    }
  },

  /**
   * Extract complete metadata from a listing card element
   * @param {HTMLElement} cardEl - The card element (article or li[role="article"])
   */
  extractFromCard(cardEl) {
    if (!cardEl) return null;

    // Find main listing link
    const linkEl = cardEl.querySelector('a[aria-label="Listing link"], a[href*="/Property/"]');
    if (!linkEl) return null;

    const href = linkEl.getAttribute('href') || '';
    const fullUrl = href.startsWith('http') ? href : `https://www.zameen.com${href}`;
    const id = this.extractPropertyIdFromUrl(href);
    if (!id) return null;

    // Title
    const titleEl = cardEl.querySelector('h2[aria-label="Title"], [aria-label="Title"]');
    const title = titleEl ? titleEl.textContent.trim() : (linkEl.getAttribute('title') || 'Plot / Property for Sale');

    // Price
    const priceEl = cardEl.querySelector('span[aria-label="Price"], [aria-label="Price"]');
    const currencyEl = cardEl.querySelector('span[aria-label="Currency"], [aria-label="Currency"]');
    const priceText = priceEl ? priceEl.textContent.trim() : '';
    const currencyText = currencyEl ? currencyEl.textContent.trim() : 'PKR';
    const price = priceText ? `${currencyText} ${priceText}`.trim() : 'Price on Request';

    // Location
    const locEl = cardEl.querySelector('div[aria-label="Location"], [aria-label="Location"]');
    const location = locEl ? locEl.textContent.trim() : '';

    // Area
    const areaEl = cardEl.querySelector('span[aria-label="Area"], [aria-label="Area"]');
    let area = areaEl ? areaEl.textContent.trim() : '';
    // Clean up internal whitespace
    area = area.replace(/\s+/g, ' ');

    // Thumbnail
    let thumbnail = '';
    const imgEl = cardEl.querySelector('picture img, img[aria-label="Listing photo"]');
    if (imgEl) {
      thumbnail = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
    }

    // Call / WhatsApp buttons
    const whatsappBtn = cardEl.querySelector('button[aria-label="Whatsapp"], a[aria-label="Whatsapp"]');
    const callBtn = cardEl.querySelector('button[aria-label="Call"]');

    return {
      id,
      url: fullUrl,
      title,
      price,
      location,
      area,
      thumbnail,
      whatsappBtn,
      callBtn
    };
  },

  /**
   * Extract property details from the current detail page (if on /Property/...)
   */
  extractFromDetailPage() {
    const path = window.location.pathname;
    if (!path.includes('/Property/')) return null;

    const id = this.extractPropertyIdFromUrl(path);
    if (!id) return null;

    const titleEl = document.querySelector('h1, [aria-label="Title"]');
    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(' - Zameen.com', '');

    const priceEl = document.querySelector('span[aria-label="Price"], [aria-label="Price"]');
    const currencyEl = document.querySelector('span[aria-label="Currency"], [aria-label="Currency"]');
    const priceText = priceEl ? priceEl.textContent.trim() : '';
    const currencyText = currencyEl ? currencyEl.textContent.trim() : 'PKR';
    const price = priceText ? `${currencyText} ${priceText}`.trim() : '';

    const locEl = document.querySelector('div[aria-label="Location"], [aria-label="Location"]');
    const location = locEl ? locEl.textContent.trim() : '';

    const areaEl = document.querySelector('span[aria-label="Area"], [aria-label="Area"]');
    const area = areaEl ? areaEl.textContent.trim().replace(/\s+/g, ' ') : '';

    const imgEl = document.querySelector('picture img, img');
    const thumbnail = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';

    return {
      id,
      url: window.location.href,
      title,
      price,
      location,
      area,
      thumbnail
    };
  }
};

if (typeof window !== 'undefined') {
  window.ZameenExtractor = ZameenExtractor;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZameenExtractor;
}
