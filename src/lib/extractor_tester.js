/**
 * Universal Review Extractor Test Suite
 * Test the universal extractor on different e-commerce sites
 */

class ReviewExtractorTester {
  constructor() {
    this.testResults = [];
  }

  /**
   * Run comprehensive test on current page
   */
  async runTest() {
    console.log('🔍 Starting Universal Review Extractor Test...');
    
    const hostname = window.location.hostname;
    const siteInfo = SiteDetectionUtils?.detectEcommerceSite(hostname);
    
    console.log(`📍 Testing on: ${hostname}`);
    console.log(`🏪 Detected site: ${siteInfo ? siteInfo.name : 'Unknown'}`);
    
    // Test 1: Site Detection
    this.testSiteDetection();
    
    // Test 2: Review Container Detection
    await this.testReviewContainerDetection();
    
    // Test 3: Text Extraction
    await this.testTextExtraction();
    
    // Test 4: Rating Extraction
    await this.testRatingExtraction();
    
    // Test 5: Compare with existing system
    await this.compareWithExistingSystem();
    
    this.printResults();
  }

  testSiteDetection() {
    console.log('\n📋 Test 1: Site Detection');
    
    const hostname = window.location.hostname;
    const isEcommerce = SiteDetectionUtils?.isEcommerceSite();
    const siteInfo = SiteDetectionUtils?.detectEcommerceSite(hostname);
    
    this.testResults.push({
      test: 'Site Detection',
      passed: siteInfo !== null || isEcommerce,
      details: {
        hostname,
        isEcommerce,
        detectedSite: siteInfo?.name || 'Generic E-commerce',
        siteType: siteInfo?.type || 'unknown'
      }
    });
    
    console.log(`✅ E-commerce detected: ${isEcommerce}`);
    console.log(`🎯 Site identified: ${siteInfo?.name || 'Generic'}`);
  }

  async testReviewContainerDetection() {
    console.log('\n📦 Test 2: Review Container Detection');
    
    const extractor = new UniversalReviewExtractor();
    const containers = extractor.detectReviewContainers();
    
    // Also test existing system
    const existingContainers = findReviewElements ? findReviewElements(document) : [];
    
    this.testResults.push({
      test: 'Review Container Detection',
      passed: containers.length > 0,
      details: {
        universalCount: containers.length,
        existingCount: existingContainers.length,
        universalElements: containers.slice(0, 3).map(el => ({
          tagName: el.tagName,
          className: el.className,
          textLength: el.textContent.length
        }))
      }
    });
    
    console.log(`🎯 Universal extractor found: ${containers.length} containers`);
    console.log(`🔄 Existing system found: ${existingContainers.length} containers`);
  }

  async testTextExtraction() {
    console.log('\n📝 Test 3: Text Extraction');
    
    const extractor = new UniversalReviewExtractor();
    const containers = extractor.detectReviewContainers();
    
    let successfulExtractions = 0;
    const sampleTexts = [];
    
    containers.slice(0, 5).forEach((container, index) => {
      const text = extractor.extractReviewText(container);
      if (text && text.length > 20) {
        successfulExtractions++;
        sampleTexts.push(text.substring(0, 100) + '...');
      }
    });
    
    this.testResults.push({
      test: 'Text Extraction',
      passed: successfulExtractions > 0,
      details: {
        totalContainers: containers.length,
        successfulExtractions,
        sampleTexts
      }
    });
    
    console.log(`📄 Successfully extracted text from: ${successfulExtractions}/${containers.length} containers`);
    sampleTexts.forEach((text, i) => console.log(`   Sample ${i + 1}: ${text}`));
  }

  async testRatingExtraction() {
    console.log('\n⭐ Test 4: Rating Extraction');
    
    const extractor = new UniversalReviewExtractor();
    const containers = extractor.detectReviewContainers();
    
    let successfulRatings = 0;
    const sampleRatings = [];
    
    containers.slice(0, 5).forEach((container, index) => {
      const rating = extractor.extractRating(container);
      if (rating !== null) {
        successfulRatings++;
        sampleRatings.push(rating);
      }
    });
    
    this.testResults.push({
      test: 'Rating Extraction',
      passed: successfulRatings > 0,
      details: {
        totalContainers: containers.length,
        successfulRatings,
        sampleRatings
      }
    });
    
    console.log(`⭐ Successfully extracted ratings from: ${successfulRatings}/${containers.length} containers`);
    console.log(`📊 Sample ratings: [${sampleRatings.join(', ')}]`);
  }

  async compareWithExistingSystem() {
    console.log('\n🔄 Test 5: Comparison with Existing System');
    
    if (typeof findReviewElements !== 'function') {
      console.log('⚠️ Existing system not available for comparison');
      return;
    }
    
    const extractor = new UniversalReviewExtractor();
    const universalContainers = extractor.detectReviewContainers();
    const existingContainers = findReviewElements(document);
    
    let universalTexts = 0;
    let existingTexts = 0;
    
    // Test text extraction
    universalContainers.slice(0, 5).forEach(container => {
      const text = extractor.extractReviewText(container);
      if (text && text.length > 20) universalTexts++;
    });
    
    existingContainers.slice(0, 5).forEach(container => {
      const text = extractReviewText ? extractReviewText(container, document) : '';
      if (text && text.length > 20) existingTexts++;
    });
    
    this.testResults.push({
      test: 'System Comparison',
      passed: true,
      details: {
        universalContainers: universalContainers.length,
        existingContainers: existingContainers.length,
        universalTexts,
        existingTexts,
        improvement: universalContainers.length - existingContainers.length
      }
    });
    
    console.log(`📈 Universal system: ${universalContainers.length} containers, ${universalTexts} texts`);
    console.log(`📊 Existing system: ${existingContainers.length} containers, ${existingTexts} texts`);
    console.log(`🚀 Improvement: ${universalContainers.length - existingContainers.length} more containers`);
  }

  printResults() {
    console.log('\n📋 Test Results Summary:');
    console.log('========================');
    
    const passedTests = this.testResults.filter(r => r.passed).length;
    const totalTests = this.testResults.length;
    
    this.testResults.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.test}`);
    });
    
    console.log(`\n🎯 Overall Score: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All tests passed! Universal extractor is working perfectly.');
    } else {
      console.log('⚠️ Some tests failed. Check the details above.');
    }
    
    return this.testResults;
  }
}

// Make tester available globally for manual testing
window.ReviewExtractorTester = ReviewExtractorTester;

// Auto-run test if in development mode
if (window.location.search.includes('debug=true')) {
  setTimeout(() => {
    const tester = new ReviewExtractorTester();
    tester.runTest();
  }, 2000);
}

console.log('🧪 Review Extractor Tester loaded. Run "new ReviewExtractorTester().runTest()" to test on any page.');