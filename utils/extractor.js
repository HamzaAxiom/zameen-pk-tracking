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
    const match = url.match(/-(\d{6,10})(?:-\d+)*\.html/i) || url.match(/\/Property\/.*?-(\d+)/i) || url.match(/[?&]id=(\d+)/i);
    if (match && match[1]) {
      return match[1];
    }
    return null;
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
    const fullUrl = window.location.href;
    const path = window.location.pathname;

    // 1. Try URL extraction
    let id = this.extractPropertyIdFromUrl(path) || this.extractPropertyIdFromUrl(fullUrl);

    // 2. Fallback: contact form message textarea (e.g. "Zameen - ID54702048")
    if (!id) {
      const msgEl = document.querySelector('textarea#contactFormMessage, textarea[name="message"]');
      if (msgEl && msgEl.value) {
        const m = msgEl.value.match(/Zameen\s*-\s*ID\s*(\d{6,10})/i) || msgEl.value.match(/ID\s*(\d{6,10})/i);
        if (m && m[1]) id = m[1];
      }
    }

    // 3. Fallback: breadcrumbs (e.g. "Residential Plot 54702048")
    if (!id) {
      const breadcrumbEl = document.querySelector('.cbfad774, [aria-label="Breadcrumb"]');
      if (breadcrumbEl) {
        const text = breadcrumbEl.textContent || '';
        const m = text.match(/(?:Plot|Property)\s+(\d{6,10})/i);
        if (m && m[1]) id = m[1];
      }
    }

    // 4. Fallback: canonical or og:url meta
    if (!id) {
      const canonicalEl = document.querySelector('link[rel="canonical"], meta[property="og:url"]');
      if (canonicalEl) {
        const href = canonicalEl.getAttribute('href') || canonicalEl.getAttribute('content') || '';
        id = this.extractPropertyIdFromUrl(href);
      }
    }

    // If still no ID found or not on a property page, return null
    if (!id) return null;

    const titleEl = document.querySelector('h1, [aria-label="Title"]');
    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(' - Zameen.com', '').trim();

    const priceEl = document.querySelector('span[aria-label="Price"], [aria-label="Price"], ._63ea997b');
    const currencyEl = document.querySelector('span[aria-label="Currency"], [aria-label="Currency"], .aa458c2e');
    const priceText = priceEl ? priceEl.textContent.trim() : '';
    const currencyText = currencyEl ? currencyEl.textContent.trim() : 'PKR';
    const price = priceText ? `${currencyText} ${priceText}`.trim() : '';

    const locEl = document.querySelector('div[aria-label="Location"], [aria-label="Location"], .cd230541');
    const location = locEl ? locEl.textContent.trim() : '';

    const areaEl = document.querySelector('span[aria-label="Area"], [aria-label="Area"], ._783ab618');
    const area = areaEl ? areaEl.textContent.trim().replace(/\s+/g, ' ') : '';

    const imgEl = document.querySelector('picture img[aria-label="Cover Photo"], picture img, img');
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
