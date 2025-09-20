/**
 * E-commerce Site Database
 * Comprehensive database of e-commerce sites and their characteristics
 */

window.EcommerceSiteDB = {
  // Major Global E-commerce Platforms
  amazon: {
    domains: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.ca', 'amazon.com.au', 'amazon.co.jp', 'amazon.in'],
    name: 'Amazon',
    type: 'marketplace',
    hasStructuredData: true,
    commonSelectors: {
      productTitle: ['#productTitle', '.product-title'],
      reviewCount: ['[data-hook="total-review-count"]', '.a-size-base'],
      averageRating: ['[data-hook="average-star-rating"]', '.a-icon-alt']
    }
  },
  
  flipkart: {
    domains: ['flipkart.com'],
    name: 'Flipkart',
    type: 'marketplace',
    hasStructuredData: false,
    commonSelectors: {
      productTitle: ['.B_NuCI', '._35KyD6'],
      reviewCount: ['._2_R_DZ', '._3LWZlK'],
      averageRating: ['.XQDdHH', '._3LWZlK']
    }
  },
  
  ebay: {
    domains: ['ebay.com', 'ebay.co.uk', 'ebay.de', 'ebay.fr', 'ebay.it', 'ebay.es', 'ebay.ca', 'ebay.com.au'],
    name: 'eBay',
    type: 'marketplace',
    hasStructuredData: true
  },
  
  etsy: {
    domains: ['etsy.com'],
    name: 'Etsy',
    type: 'marketplace',
    hasStructuredData: true
  },
  
  aliexpress: {
    domains: ['aliexpress.com', 'aliexpress.ru'],
    name: 'AliExpress',
    type: 'marketplace',
    hasStructuredData: false
  },
  
  walmart: {
    domains: ['walmart.com', 'walmart.ca'],
    name: 'Walmart',
    type: 'retailer',
    hasStructuredData: true
  },
  
  target: {
    domains: ['target.com'],
    name: 'Target',
    type: 'retailer',
    hasStructuredData: true
  },
  
  bestbuy: {
    domains: ['bestbuy.com', 'bestbuy.ca'],
    name: 'Best Buy',
    type: 'retailer',
    hasStructuredData: true
  },
  
  // Indian E-commerce
  myntra: {
    domains: ['myntra.com'],
    name: 'Myntra',
    type: 'fashion',
    hasStructuredData: false
  },
  
  nykaa: {
    domains: ['nykaa.com'],
    name: 'Nykaa',
    type: 'beauty',
    hasStructuredData: false
  },
  
  // Shopify-based stores (detected by presence of Shopify indicators)
  shopify: {
    domains: ['*'], // Wildcard - detected by presence indicators
    name: 'Shopify Store',
    type: 'platform',
    hasStructuredData: true,
    detectionMethod: ['[data-shopify]', '.shopify-section', 'script[src*="shopify"]']
  },
  
  // Additional major e-commerce sites
  wayfair: {
    domains: ['wayfair.com', 'wayfair.co.uk', 'wayfair.de'],
    name: 'Wayfair',
    type: 'home',
    hasStructuredData: true
  },
  
  overstock: {
    domains: ['overstock.com'],
    name: 'Overstock',
    type: 'retailer',
    hasStructuredData: true
  },
  
  homedepot: {
    domains: ['homedepot.com', 'homedepot.ca'],
    name: 'Home Depot',
    type: 'home',
    hasStructuredData: true
  },
  
  lowes: {
    domains: ['lowes.com'],
    name: "Lowe's",
    type: 'home',
    hasStructuredData: true
  },
  
  newegg: {
    domains: ['newegg.com', 'newegg.ca'],
    name: 'Newegg',
    type: 'electronics',
    hasStructuredData: true
  },
  
  // Fashion
  zara: {
    domains: ['zara.com'],
    name: 'Zara',
    type: 'fashion',
    hasStructuredData: false
  },
  
  hm: {
    domains: ['hm.com'],
    name: 'H&M',
    type: 'fashion',
    hasStructuredData: false
  },
  
  // Beauty
  sephora: {
    domains: ['sephora.com', 'sephora.fr', 'sephora.de'],
    name: 'Sephora',
    type: 'beauty',
    hasStructuredData: true
  },
  
  ulta: {
    domains: ['ulta.com'],
    name: 'Ulta Beauty',
    type: 'beauty',
    hasStructuredData: true
  }
};

/**
 * Site detection utilities
 */
window.SiteDetectionUtils = {
  /**
   * Detect e-commerce site from hostname
   */
  detectEcommerceSite(hostname) {
    hostname = hostname.toLowerCase();
    
    for (const [siteKey, siteInfo] of Object.entries(window.EcommerceSiteDB)) {
      // Check direct domain matches
      if (siteInfo.domains.some(domain => {
        if (domain === '*') return false; // Skip wildcards
        return hostname.includes(domain);
      })) {
        return { key: siteKey, ...siteInfo };
      }
      
      // Check detection methods for platform-based sites
      if (siteInfo.detectionMethod && document) {
        const hasIndicators = siteInfo.detectionMethod.some(selector => 
          document.querySelector(selector));
        if (hasIndicators) {
          return { key: siteKey, ...siteInfo };
        }
      }
    }
    
    return null;
  },
  
  /**
   * Check if current site is likely an e-commerce site
   */
  isEcommerceSite(doc = document) {
    // Check for common e-commerce indicators
    const ecommerceIndicators = [
      // Shopping cart
      '[class*="cart"]', '[id*="cart"]', '[data-testid*="cart"]',
      // Add to cart buttons
      '[class*="add-to-cart"]', '[id*="add-to-cart"]', 'button[class*="buy"]',
      // Price elements
      '[class*="price"]', '[id*="price"]', '.currency',
      // Product elements
      '[class*="product"]', '[id*="product"]',
      // Reviews
      '[class*="review"]', '[class*="rating"]', '[class*="star"]'
    ];
    
    let indicatorCount = 0;
    for (const selector of ecommerceIndicators) {
      if (doc.querySelector(selector)) {
        indicatorCount++;
      }
    }
    
    // If we find multiple indicators, likely an e-commerce site
    return indicatorCount >= 3;
  },
  
  /**
   * Get site-specific optimization hints
   */
  getSiteOptimizations(siteKey) {
    const optimizations = {
      amazon: {
        waitForLazyLoad: true,
        expandReviews: '[data-hook="expand-collapse-button"]',
        pagination: '[data-hook="pagination-bar"] a'
      },
      flipkart: {
        waitForLazyLoad: true,
        expandReviews: '._1EPkIx',
        pagination: '._1LKTO3 a'
      },
      shopify: {
        checkForApps: true,
        commonReviewAppSelectors: [
          '.stamped-reviews', '.yotpo-reviews', '.trustpilot-widget',
          '.judge-me-reviews', '.loox-reviews'
        ]
      }
    };
    
    return optimizations[siteKey] || {};
  }
};