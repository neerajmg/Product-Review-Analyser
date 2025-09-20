/*
 * Site-specific selectors and generic fallbacks
 * Provides UMD-style export: window.PPCSelectors or module.exports
 */
console.log('PPC_DEBUG: selectors.js loading...');
(function(root){
  const SiteSelectors = {
    amazon: {
      reviewContainer: ['#cm_cr-review_list .review', '.review', '[data-hook="review"]'],
      reviewText: ['.review-text-content', '[data-hook=review-body]', '.cr-original-review-text'],
      reviewIdAttr: ['data-hook', 'id'],
      rating: ['.a-icon-alt', '.review-rating']
    },
    flipkart: {
      reviewContainer: [
        // Modern Flipkart review structure (2024-2025)
        '._1AtVbE', '._27M-vq', '.col-12-12', '.cPHDOP',
        // Generic review patterns for Flipkart
        '[class*="review"]', '[data-testid*="review"]',
        // Look for elements containing review text patterns
        'div:has-text("Certified Buyer")', 'div:has-text("★")',
        // Fallback patterns
        'div[class*="_"], div[id*="review"]'
      ],
      reviewText: [
        // Modern Flipkart text selectors
        '._2-N8zT', '.t-ZTKy', '._2xg6Ul', '.qwjRop',
        // Generic text patterns
        '[data-testid="review-text"]', '[class*="review-text"]',
        '[class*="review-content"]', '[class*="comment"]',
        // Fallback for any text container
        'div, p, span'
      ],
      reviewIdAttr: ['data-testid', 'data-id', 'id', 'class'],
      rating: [
        // Modern Flipkart rating selectors
        '.XQDdHH', '._3LWZlK', '.hGSR34', '._3n8uyp',
        // Generic rating patterns
        '[class*="star"]', '[aria-label*="star"]', 
        '[class*="rating"]', 'span:has-text("★")'
      ]
    },
    ebay: {
      reviewContainer: ['.reviews .review-item', '.ebay-review', '.reviews-card'],
      reviewText: ['.review-item-text', '.review-text', '.ebay-review-text'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.star-rating', '.rating-stars']
    },
    etsy: {
      reviewContainer: ['.review', '.shop2-review-review', '.shop-review'],
      reviewText: ['.review-text', '.shop2-review-text', '.review-description'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.rating', '.stars']
    },
    aliexpress: {
      reviewContainer: ['.feedback-item', '.review-item', '.feedback-list-item'],
      reviewText: ['.feedback-content', '.review-content', '.buyer-feedback'],
      reviewIdAttr: ['data-feedback-id', 'data-review-id', 'id'],
      rating: ['.star-view', '.rating-view']
    },
    walmart: {
      reviewContainer: ['.review-item', '.customer-review', '[data-testid="reviews-section"] .review'],
      reviewText: ['.review-text', '.review-body', '[data-testid="review-text"]'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.star-rating', '.rating-stars']
    },
    target: {
      reviewContainer: ['.ReviewItem', '.review-item', '[data-test="review-content"]'],
      reviewText: ['.ReviewContent', '.review-text', '[data-test="review-body"]'],
      reviewIdAttr: ['data-test', 'id'],
      rating: ['.Rating', '.star-rating']
    },
    bestbuy: {
      reviewContainer: ['.review-item', '.ugc-review', '.customer-review'],
      reviewText: ['.review-text', '.ugc-review-body', '.review-body'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.star-rating', '.rating']
    },
    shopify: {
      reviewContainer: [
        '.spr-review', '.review', '.product-review',
        '.stamped-review', '.yotpo-review', '.trustpilot-review',
        '.judge-me-review', '.loox-review'
      ],
      reviewText: [
        '.spr-review-content', '.review-content', '.review-text',
        '.stamped-review-content', '.yotpo-review-content',
        '.trustpilot-review-content', '.judge-me-review-text'
      ],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: [
        '.spr-starrating', '.star-rating', '.stamped-starrating',
        '.yotpo-star-rating', '.trustpilot-star-rating'
      ]
    },
    wayfair: {
      reviewContainer: ['.ProductReviewsList-item', '.Review', '.customer-review'],
      reviewText: ['.Review-content', '.review-text', '.Review-body'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.Review-rating', '.star-rating', '.Rating']
    },
    overstock: {
      reviewContainer: ['.review-item', '.customer-review', '.product-review'],
      reviewText: ['.review-content', '.review-text', '.review-body'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.star-rating', '.rating-stars', '.review-rating']
    },
    homedepot: {
      reviewContainer: ['.review-item', '.customer-review', '[data-testid="review"]'],
      reviewText: ['.review-text', '.review-content', '[data-testid="review-text"]'],
      reviewIdAttr: ['data-testid', 'data-review-id', 'id'],
      rating: ['.star-rating', '.rating', '[data-testid="rating"]']
    },
    lowes: {
      reviewContainer: ['.review-item', '.customer-review', '.product-review'],
      reviewText: ['.review-text', '.review-content', '.review-body'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.star-rating', '.rating-stars', '.review-rating']
    },
    newegg: {
      reviewContainer: ['.review-item', '.customer-review', '.product-review'],
      reviewText: ['.review-text', '.review-content', '.review-body'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.star-rating', '.rating-stars', '.review-rating']
    },
    zara: {
      reviewContainer: ['.review', '.product-review', '.customer-review'],
      reviewText: ['.review-text', '.review-content', '.review-body'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.star-rating', '.rating', '.review-rating']
    },
    hm: {
      reviewContainer: ['.review', '.product-review', '.customer-review'],
      reviewText: ['.review-text', '.review-content', '.review-body'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.star-rating', '.rating', '.review-rating']
    },
    sephora: {
      reviewContainer: ['.review-item', '.ProductReview', '.customer-review'],
      reviewText: ['.review-text', '.ReviewContent', '.review-body'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.star-rating', '.Rating', '.review-rating']
    },
    ulta: {
      reviewContainer: ['.review-item', '.ProductReview', '.customer-review'],
      reviewText: ['.review-text', '.ReviewContent', '.review-body'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.star-rating', '.Rating', '.review-rating']
    },
    myntra: {
      reviewContainer: ['.user-review', '.review-userReview', '.detailed-reviews-userReviewsContainer'],
      reviewText: ['.user-review-reviewTextWrapper', '.review-reviewText', '.user-review-text'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.user-review-starRating', '.rating-mini']
    },
    nykaa: {
      reviewContainer: ['.ReviewTile', '.review-tile', '.product-review'],
      reviewText: ['.ReviewContent', '.review-content', '.review-text'],
      reviewIdAttr: ['data-review-id', 'id'],
      rating: ['.Rating', '.star-rating']
    },
    generic: {
      reviewContainer: [
        '.review', '.review-item', '.customer-review', '.user-review', '.product-review',
        '[class*="review"]', '[data-review-id]', '[data-testid*="review"]',
        '.feedback', '.comment', '.testimonial', '.rating-review'
      ],
      reviewText: [
        '.review-text', '.review-content', '.review-body', '.review-description',
        '.feedback-text', '.comment-text', '.testimonial-text',
        '[class*="review-text"]', '[class*="review-content"]', '[class*="review-body"]'
      ],
      reviewIdAttr: ['data-review-id', 'data-testid', 'id', 'data-id'],
      rating: [
        '.rating', '.star-rating', '.stars', '.rating-stars', '.rate',
        '[class*="rating"]', '[class*="star"]', '[aria-label*="star"]',
        '.score', '.grade'
      ]
    }
  };

  function firstMatch(el, selectors) {
    for (const sel of selectors) {
      const found = el.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  function detectSite(doc) {
    const hostname = doc.location?.hostname || '';
    
    // Use site database for enhanced detection
    if (typeof SiteDetectionUtils !== 'undefined') {
      const siteInfo = SiteDetectionUtils.detectEcommerceSite(hostname);
      if (siteInfo) {
        console.log(`Detected e-commerce site: ${siteInfo.name} (${siteInfo.key})`);
        return siteInfo.key;
      }
      
      // Check if it's an e-commerce site even if not in our database
      if (SiteDetectionUtils.isEcommerceSite(doc)) {
        console.log('Generic e-commerce site detected');
        return 'generic';
      }
    }
    
    // Fallback to basic detection for backward compatibility
    if (hostname.includes('amazon.')) return 'amazon';
    if (hostname.includes('flipkart.')) return 'flipkart';
    if (hostname.includes('ebay.')) return 'ebay';
    if (hostname.includes('etsy.')) return 'etsy';
    if (hostname.includes('aliexpress.')) return 'aliexpress';
    if (hostname.includes('walmart.')) return 'walmart';
    if (hostname.includes('target.')) return 'target';
    if (hostname.includes('bestbuy.')) return 'bestbuy';
    if (hostname.includes('myntra.')) return 'myntra';
    if (hostname.includes('nykaa.')) return 'nykaa';
    if (hostname.includes('shopify.') || doc.querySelector('[data-shopify]')) return 'shopify';
    
    // Final fallback
    console.log('Unknown site, using generic selectors for:', hostname);
    return 'generic';
  }

  function findReviewElements(doc) {
    const site = detectSite(doc);
    const selectors = SiteSelectors[site] || SiteSelectors.generic;
    
    // Try site-specific selectors
    let nodes = [];
    for (const sel of selectors.reviewContainer) {
      try {
        nodes = doc.querySelectorAll(sel);
        if (nodes && nodes.length) break;
      } catch (e) {
        // Skip invalid selectors
        continue;
      }
    }
    
    // Special handling for Flipkart (dynamic content)
    if (site === 'flipkart' && (!nodes || !nodes.length)) {
      console.log('Trying Flipkart-specific review detection...');
      
      // Look for text patterns that indicate reviews
      const allElements = doc.querySelectorAll('div, p, span');
      const reviewElements = [];
      
      allElements.forEach(el => {
        const text = el.textContent || '';
        const hasReviewIndicators = (
          text.includes('Certified Buyer') ||
          text.includes('★') ||
          text.includes(' star') ||
          (text.length > 50 && text.length < 2000 && 
           (text.includes('good') || text.includes('bad') || text.includes('quality') || 
            text.includes('product') || text.includes('buy') || text.includes('recommend')))
        );
        
        if (hasReviewIndicators && !reviewElements.includes(el)) {
          // Find the appropriate container (usually a parent div)
          let container = el;
          let level = 0;
          while (container.parentElement && level < 5) {
            container = container.parentElement;
            level++;
            // Stop if we find a good container size
            const containerText = container.textContent || '';
            if (containerText.length > 100 && containerText.length < 3000) {
              break;
            }
          }
          reviewElements.push(container);
        }
      });
      
      // Remove duplicates
      nodes = reviewElements.filter((el, index) => 
        reviewElements.indexOf(el) === index).slice(0, 20);
      
      console.log(`Flipkart text-based detection found ${nodes.length} review candidates`);
    }
    
    // If no results with site-specific selectors, try universal detection
    if (!nodes || !nodes.length) {
      console.log('No reviews found with site-specific selectors, trying universal detection...');
      
      // Try universal extractor if available
      if (typeof UniversalReviewExtractor !== 'undefined') {
        const extractor = new UniversalReviewExtractor();
        nodes = extractor.detectReviewContainers(doc);
        if (nodes && nodes.length) {
          console.log(`Universal extractor found ${nodes.length} review candidates`);
        }
      }
      
      // Final fallback: basic generic patterns
      if (!nodes || !nodes.length) {
        nodes = doc.querySelectorAll([
          '[data-review-id]', '.review', '[class*="review"]',
          '.customer-review', '.user-review', '.product-review',
          '.feedback', '.comment', '.testimonial'
        ].join(','));
      }
    }
    
    console.log(`PPC_DEBUG: Found ${nodes?.length || 0} review elements on ${site} site`);
    
    // Log first few elements for debugging
    if (nodes && nodes.length > 0) {
      console.log('PPC_DEBUG: First 3 review elements:', Array.from(nodes).slice(0, 3).map(el => ({
        tag: el.tagName,
        class: el.className,
        textLength: el.textContent?.length || 0,
        textPreview: el.textContent?.substring(0, 100) + '...'
      })));
    }
    
    return Array.from(nodes || []);
  }

  function extractReviewText(container, doc) {
    const site = detectSite(doc || document);
    const siteSelectors = SiteSelectors[site] || SiteSelectors.generic;
    const selectors = siteSelectors.reviewText;
    
    // Try site-specific selectors first
    const el = firstMatch(container, selectors);
    if (el && el.textContent.trim().length > 10) {
      return el.textContent.trim();
    }
    
    // Special handling for Flipkart
    if (site === 'flipkart') {
      const text = container.textContent || '';
      
      // Clean up Flipkart-specific text patterns
      let cleanText = text
        .replace(/Certified Buyer[,\s]*\w*/g, '') // Remove "Certified Buyer, Location"
        .replace(/\s*[A-Z][a-z]+,?\s*\d{4}\s*/g, '') // Remove "Month, Year"
        .replace(/\s*\d+\s*\d+\s*/g, '') // Remove like/dislike numbers
        .replace(/Really Nice|Good quality product|[A-Z][a-z\s]+:/g, '') // Remove generic titles
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      // Extract meaningful review content
      const sentences = cleanText.split(/[.!?]+/).filter(s => 
        s.trim().length > 20 && 
        !s.includes('★') && 
        !s.match(/^\s*\d+\s*$/)
      );
      
      if (sentences.length > 0) {
        return sentences.join('. ').trim().slice(0, 2000);
      }
    }
    
    // Try universal extractor if available
    if (typeof UniversalReviewExtractor !== 'undefined') {
      const extractor = new UniversalReviewExtractor();
      const extractedText = extractor.extractReviewText(container);
      if (extractedText && extractedText.length > 10) {
        return extractedText;
      }
    }
    
    // Final fallback
    let fallbackText = container.textContent.trim();
    
    // Clean up common noise for any site
    fallbackText = fallbackText
      .replace(/^\s*[\d★]+\s*/, '') // Remove leading ratings
      .replace(/\s*\d+\s*helpful\s*\d+\s*unhelpful\s*/gi, '') // Remove helpful votes
      .slice(0, 2000);
    
    return fallbackText;
  }

  function extractRating(container, doc) {
    const site = detectSite(doc || document);
    const siteSelectors = SiteSelectors[site] || SiteSelectors.generic;
    const selectors = siteSelectors.rating;
    
    // Try site-specific selectors first
    const r = firstMatch(container, selectors);
    if (r) {
      const rating = parseRatingText(r.textContent) || parseRatingText(r.getAttribute('aria-label'));
      if (rating !== null) return rating;
    }
    
    // Special handling for Flipkart ratings
    if (site === 'flipkart') {
      const text = container.textContent || '';
      
      // Look for Flipkart-specific rating patterns
      const flipkartPatterns = [
        /(\d)\s*★/,  // "4 ★"
        /(\d)\s*⭐/,  // "4 ⭐"
        /★{1,5}/g,   // Count stars
        /⭐{1,5}/g   // Count star emojis
      ];
      
      for (const pattern of flipkartPatterns) {
        const match = text.match(pattern);
        if (match) {
          if (match[1]) {
            const rating = parseInt(match[1]);
            if (rating >= 1 && rating <= 5) return rating;
          } else {
            // Count stars
            const starCount = match[0].length;
            if (starCount >= 1 && starCount <= 5) return starCount;
          }
        }
      }
    }
    
    // Try universal extractor if available
    if (typeof UniversalReviewExtractor !== 'undefined') {
      const extractor = new UniversalReviewExtractor();
      const rating = extractor.extractRating(container);
      if (rating !== null) return rating;
    }
    
    // Final fallback: scan all text in container
    const allText = container.textContent + ' ' + (container.getAttribute('aria-label') || '');
    return parseRatingText(allText);
  }

  function parseRatingText(text) {
    if (!text) return null;
    
    // Try multiple rating patterns
    const patterns = [
      /(\d+(?:\.\d+)?)\s*(?:out of|\/|\sof\s)?\s*\d+\s*(?:stars?|points?)/i,
      /(\d+(?:\.\d+)?)\s*stars?/i,
      /(\d+(?:\.\d+)?)\s*\/\s*\d+/,
      /rating[:\s]*(\d+(?:\.\d+)?)/i,
      /([0-5](?:\.[0-9])?)\s*(?:stars?)?/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const rating = parseFloat(match[1]);
        if (!isNaN(rating) && rating >= 1 && rating <= 5) {
          return rating;
        }
      }
    }
    
    return null;
  }

  const api = { findReviewElements, extractReviewText, extractRating };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PPCSelectors = api;
    console.log('PPC_DEBUG: PPCSelectors API attached to window');
  }
})(typeof window !== 'undefined' ? window : globalThis);
