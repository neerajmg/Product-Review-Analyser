/*
 * Site-specific selectors and generic fallbacks
 * Provides UMD-style export: window.PPCSelectors or module.exports
 */
(function(root){
  const AmazonSelectors = {
    reviewContainer: ['#cm_cr-review_list .review', '.review'],
    reviewText: ['.review-text-content', '[data-hook=review-body]'],
    reviewIdAttr: ['data-hook', 'id'],
    rating: ['.a-icon-alt']
  };

  function firstMatch(el, selectors) {
    for (const sel of selectors) {
      const found = el.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  function findReviewElements(doc) {
    // Try Amazon
    let nodes = [];
    for (const sel of AmazonSelectors.reviewContainer) {
      nodes = doc.querySelectorAll(sel);
      if (nodes && nodes.length) break;
    }
    if (!nodes || !nodes.length) {
      // Generic fallback: any element with data-review-id
      nodes = doc.querySelectorAll('[data-review-id]');
    }
    return Array.from(nodes);
  }

  function extractReviewText(container) {
    const el = firstMatch(container, AmazonSelectors.reviewText);
    if (el) return el.textContent.trim();
    return container.textContent.trim().slice(0, 2000); // fallback capped
  }

  function extractRating(container) {
    const r = firstMatch(container, AmazonSelectors.rating);
    if (r) {
      const m = r.textContent.match(/([0-9]+(?:\.[0-9])?)/);
      if (m) return parseFloat(m[1]);
    }
    return null;
  }

  const api = { findReviewElements, extractReviewText, extractRating };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PPCSelectors = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
