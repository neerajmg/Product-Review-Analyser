/**
 * Universal E-commerce Review Extractor
 * Intelligently detects and extracts reviews from any e-commerce site
 */

class UniversalReviewExtractor {
  constructor() {
    // Common patterns found across e-commerce sites
    this.patterns = {
      // Text patterns that indicate review content
      reviewIndicators: [
        'review', 'rating', 'feedback', 'comment', 'testimonial',
        'customer', 'buyer', 'user', 'opinion', 'experience'
      ],
      
      // Rating patterns (stars, numbers, etc.)
      ratingPatterns: [
        /(\d+(?:\.\d+)?)\s*(?:out of|\/|\sof\s)?\s*(\d+)?\s*(?:stars?|points?)/i,
        /(\d+(?:\.\d+)?)\s*stars?/i,
        /(\d+(?:\.\d+)?)\s*\/\s*(\d+)/,
        /rating[:\s]*(\d+(?:\.\d+)?)/i
      ],
      
      // Review text length thresholds
      minReviewLength: 10,
      maxReviewLength: 5000
    };
  }

  /**
   * Auto-detect review containers using multiple heuristics
   */
  detectReviewContainers(doc = document) {
    const candidates = new Map();
    
    // Method 1: Look for elements with review-related class names
    const reviewClassElements = doc.querySelectorAll([
      '[class*="review"]',
      '[class*="rating"]', 
      '[class*="feedback"]',
      '[class*="comment"]',
      '[class*="testimonial"]'
    ].join(','));
    
    reviewClassElements.forEach(el => this.scoreElement(el, candidates, 'class'));
    
    // Method 2: Look for elements with review-related data attributes
    const reviewDataElements = doc.querySelectorAll([
      '[data-review-id]',
      '[data-testid*="review"]',
      '[data-qa*="review"]',
      '[id*="review"]'
    ].join(','));
    
    reviewDataElements.forEach(el => this.scoreElement(el, candidates, 'data'));
    
    // Method 3: Look for structured data (JSON-LD, microdata)
    this.findStructuredReviews(doc, candidates);
    
    // Method 4: Text content analysis
    this.analyzeTextContent(doc, candidates);
    
    // Return top scoring candidates
    return Array.from(candidates.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 20)
      .map(([el]) => el);
  }

  /**
   * Score an element based on review likelihood
   */
  scoreElement(element, candidates, source) {
    let score = candidates.get(element)?.score || 0;
    
    // Base score for detection method
    switch(source) {
      case 'class': score += 10; break;
      case 'data': score += 15; break;
      case 'structured': score += 20; break;
      case 'text': score += 5; break;
    }
    
    // Bonus points for specific indicators
    const classList = element.className.toLowerCase();
    const dataAttrs = Array.from(element.attributes)
      .map(attr => attr.name.toLowerCase()).join(' ');
    
    this.patterns.reviewIndicators.forEach(indicator => {
      if (classList.includes(indicator)) score += 8;
      if (dataAttrs.includes(indicator)) score += 10;
    });
    
    // Bonus for containing multiple review-like elements
    const childReviews = element.querySelectorAll('[class*="review"], [data-review-id]');
    if (childReviews.length > 1) score += childReviews.length * 3;
    
    // Penalty for being too high in DOM tree (usually containers)
    const depth = this.getElementDepth(element);
    if (depth < 3) score -= 5;
    
    // Bonus for appropriate text length
    const textLength = element.textContent?.trim().length || 0;
    if (textLength >= this.patterns.minReviewLength && textLength <= this.patterns.maxReviewLength) {
      score += 5;
    }
    
    candidates.set(element, { score, source });
  }

  /**
   * Look for structured data reviews (JSON-LD, microdata)
   */
  findStructuredReviews(doc, candidates) {
    // JSON-LD structured data
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    jsonLdScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        if (this.hasReviewData(data)) {
          // Find associated DOM elements
          const reviewElements = doc.querySelectorAll('[itemtype*="Review"], [typeof*="Review"]');
          reviewElements.forEach(el => this.scoreElement(el, candidates, 'structured'));
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    });
    
    // Microdata
    const microdataReviews = doc.querySelectorAll('[itemtype*="Review"], [itemscope][itemtype*="review" i]');
    microdataReviews.forEach(el => this.scoreElement(el, candidates, 'structured'));
  }

  /**
   * Analyze text content for review patterns
   */
  analyzeTextContent(doc, candidates) {
    const textElements = doc.querySelectorAll('p, div, span');
    
    textElements.forEach(el => {
      const text = el.textContent?.trim() || '';
      
      // Check for rating patterns
      const hasRating = this.patterns.ratingPatterns.some(pattern => pattern.test(text));
      
      // Check for review-like text length and content
      const hasReviewLength = text.length >= this.patterns.minReviewLength && 
                             text.length <= this.patterns.maxReviewLength;
      
      // Check for review indicators in text
      const hasReviewWords = this.patterns.reviewIndicators.some(word => 
        text.toLowerCase().includes(word));
      
      if ((hasRating || hasReviewLength) && hasReviewWords) {
        this.scoreElement(el, candidates, 'text');
      }
    });
  }

  /**
   * Check if structured data contains review information
   */
  hasReviewData(data) {
    if (Array.isArray(data)) {
      return data.some(item => this.hasReviewData(item));
    }
    
    if (typeof data === 'object' && data !== null) {
      const type = data['@type'] || data.type || '';
      if (type.toLowerCase().includes('review')) return true;
      
      // Check for review properties
      const reviewProps = ['review', 'reviews', 'aggregateRating', 'reviewRating'];
      return reviewProps.some(prop => data[prop]);
    }
    
    return false;
  }

  /**
   * Get element depth in DOM tree
   */
  getElementDepth(element) {
    let depth = 0;
    let current = element;
    while (current.parentElement) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }

  /**
   * Extract review text using intelligent heuristics
   */
  extractReviewText(container) {
    // Try common review text selectors first
    const textSelectors = [
      '.review-text', '.review-content', '.review-body', '.review-description',
      '.feedback-text', '.comment-text', '.testimonial-text',
      '[class*="review-text"]', '[class*="review-content"]', 
      '[class*="review-body"]', '[class*="comment"]'
    ];
    
    for (const selector of textSelectors) {
      const textEl = container.querySelector(selector);
      if (textEl && textEl.textContent.trim().length > this.patterns.minReviewLength) {
        return textEl.textContent.trim();
      }
    }
    
    // Fallback: find the largest text block in container
    const textElements = container.querySelectorAll('p, div, span');
    let longestText = '';
    
    textElements.forEach(el => {
      const text = el.textContent.trim();
      if (text.length > longestText.length && 
          text.length >= this.patterns.minReviewLength &&
          text.length <= this.patterns.maxReviewLength) {
        longestText = text;
      }
    });
    
    return longestText || container.textContent.trim().slice(0, 2000);
  }

  /**
   * Extract rating using intelligent pattern matching
   */
  extractRating(container) {
    // Try common rating selectors
    const ratingSelectors = [
      '.rating', '.star-rating', '.stars', '.rating-stars', '.rate',
      '[class*="rating"]', '[class*="star"]', '[aria-label*="star"]',
      '.score', '.grade'
    ];
    
    for (const selector of ratingSelectors) {
      const ratingEl = container.querySelector(selector);
      if (ratingEl) {
        const rating = this.parseRating(ratingEl);
        if (rating !== null) return rating;
      }
    }
    
    // Fallback: scan all text for rating patterns
    const allText = container.textContent;
    for (const pattern of this.patterns.ratingPatterns) {
      const match = allText.match(pattern);
      if (match) {
        const rating = parseFloat(match[1]);
        if (!isNaN(rating) && rating >= 1 && rating <= 5) {
          return rating;
        }
      }
    }
    
    return null;
  }

  /**
   * Parse rating from element
   */
  parseRating(element) {
    // Check aria-label first (most reliable)
    const ariaLabel = element.getAttribute('aria-label') || '';
    for (const pattern of this.patterns.ratingPatterns) {
      const match = ariaLabel.match(pattern);
      if (match) {
        const rating = parseFloat(match[1]);
        if (!isNaN(rating)) return rating;
      }
    }
    
    // Check text content
    const text = element.textContent.trim();
    for (const pattern of this.patterns.ratingPatterns) {
      const match = text.match(pattern);
      if (match) {
        const rating = parseFloat(match[1]);
        if (!isNaN(rating)) return rating;
      }
    }
    
    // Check for star count in class names or data attributes
    const className = element.className;
    const starMatch = className.match(/star[s]?[-_]?(\d+)/i);
    if (starMatch) {
      return parseInt(starMatch[1]);
    }
    
    return null;
  }
}

// Export for use in other modules
window.UniversalReviewExtractor = UniversalReviewExtractor;