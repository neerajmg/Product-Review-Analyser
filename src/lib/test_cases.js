/**
 * Universal E-commerce Test Cases
 * Test data and examples for different e-commerce sites
 */

const UniversalTestCases = {
  // Test cases for different site types
  testSites: [
    {
      name: 'Amazon',
      url: 'https://www.amazon.com/dp/B08N5WRWNW',
      expectedSite: 'amazon',
      expectedContainers: '[data-hook="review"]'
    },
    {
      name: 'Flipkart', 
      url: 'https://www.flipkart.com/redmi-note-10-pro/product-reviews/itm123456',
      expectedSite: 'flipkart',
      expectedContainers: '[data-testid="reviews-card"]'
    },
    {
      name: 'eBay',
      url: 'https://www.ebay.com/itm/123456789',
      expectedSite: 'ebay',
      expectedContainers: '.reviews .review-item'
    },
    {
      name: 'Walmart',
      url: 'https://www.walmart.com/ip/123456789',
      expectedSite: 'walmart', 
      expectedContainers: '.review-item'
    },
    {
      name: 'Target',
      url: 'https://www.target.com/p/123456789',
      expectedSite: 'target',
      expectedContainers: '.ReviewItem'
    },
    {
      name: 'Generic Shopify Store',
      url: 'https://example-store.myshopify.com/products/test',
      expectedSite: 'shopify',
      expectedContainers: '.spr-review, .stamped-review'
    }
  ],

  // Sample review HTML for testing
  sampleReviewHTML: {
    generic: `
      <div class="review-item" data-review-id="r123">
        <div class="star-rating" aria-label="4 out of 5 stars">⭐⭐⭐⭐</div>
        <div class="review-text">
          This product is amazing! Great quality and fast shipping. 
          The build quality exceeded my expectations and it works perfectly.
        </div>
      </div>
    `,
    
    amazon: `
      <div data-hook="review" class="review">
        <span class="a-icon-alt">4.0 out of 5 stars</span>
        <span data-hook="review-body" class="review-text-content">
          Excellent product with great features. Works as expected and arrived quickly.
        </span>
      </div>
    `,
    
    flipkart: `
      <div data-testid="reviews-card" class="review-card">
        <div class="XQDdHH">4 ⭐</div>
        <div data-testid="review-text" class="review-content">
          Very good product. Quality is excellent and delivery was fast.
        </div>
      </div>
    `
  },

  // Test the detection system
  async runDetectionTest() {
    console.log('🧪 Running Universal Detection Test...');
    
    const results = [];
    
    for (const testCase of this.testSites) {
      console.log(`\n🔍 Testing ${testCase.name}...`);
      
      // Simulate different hostnames
      const mockDoc = {
        location: { hostname: new URL(testCase.url).hostname },
        querySelector: () => null,
        querySelectorAll: () => []
      };
      
      const detectedSite = detectSite ? detectSite(mockDoc) : 'unknown';
      const passed = detectedSite === testCase.expectedSite;
      
      results.push({
        site: testCase.name,
        expected: testCase.expectedSite,
        detected: detectedSite,
        passed
      });
      
      console.log(`${passed ? '✅' : '❌'} Expected: ${testCase.expectedSite}, Got: ${detectedSite}`);
    }
    
    const passedCount = results.filter(r => r.passed).length;
    console.log(`\n📊 Detection Test Results: ${passedCount}/${results.length} passed`);
    
    return results;
  },

  // Test HTML parsing
  testHTMLParsing() {
    console.log('\n🔬 Testing HTML Parsing...');
    
    const parser = new DOMParser();
    const results = [];
    
    Object.entries(this.sampleReviewHTML).forEach(([type, html]) => {
      console.log(`\nTesting ${type} HTML...`);
      
      const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
      const container = doc.querySelector('div');
      
      // Test universal extractor
      if (typeof UniversalReviewExtractor !== 'undefined') {
        const extractor = new UniversalReviewExtractor();
        const text = extractor.extractReviewText(container);
        const rating = extractor.extractRating(container);
        
        console.log(`📝 Extracted text: "${text.substring(0, 50)}..."`);
        console.log(`⭐ Extracted rating: ${rating}`);
        
        results.push({
          type,
          textExtracted: text.length > 10,
          ratingExtracted: rating !== null
        });
      }
    });
    
    return results;
  },

  // Comprehensive test runner
  async runAllTests() {
    console.log('🚀 Starting Comprehensive Universal Extractor Tests...\n');
    
    const detectionResults = await this.runDetectionTest();
    const parsingResults = this.testHTMLParsing();
    
    console.log('\n📋 Final Test Summary:');
    console.log('======================');
    
    const totalDetectionPassed = detectionResults.filter(r => r.passed).length;
    const totalParsingPassed = parsingResults.filter(r => r.textExtracted && r.ratingExtracted).length;
    
    console.log(`🎯 Site Detection: ${totalDetectionPassed}/${detectionResults.length} passed`);
    console.log(`🔬 HTML Parsing: ${totalParsingPassed}/${parsingResults.length} passed`);
    
    const overallSuccess = (totalDetectionPassed + totalParsingPassed) / (detectionResults.length + parsingResults.length);
    console.log(`\n🎉 Overall Success Rate: ${Math.round(overallSuccess * 100)}%`);
    
    if (overallSuccess > 0.8) {
      console.log('✅ Universal extractor is working excellently!');
    } else if (overallSuccess > 0.6) {
      console.log('⚠️ Universal extractor is working but needs some improvements.');
    } else {
      console.log('❌ Universal extractor needs significant fixes.');
    }
    
    return {
      detection: detectionResults,
      parsing: parsingResults,
      overallSuccess
    };
  }
};

// Make available globally
window.UniversalTestCases = UniversalTestCases;

console.log('🧪 Universal Test Cases loaded. Run "UniversalTestCases.runAllTests()" to test.');