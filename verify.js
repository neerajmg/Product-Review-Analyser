// Quick verification that all files are working
console.log('=== Extension File Verification ===');

// Check if all components are loaded
const components = [
  { name: 'SiteDetectionUtils', obj: window.SiteDetectionUtils },
  { name: 'EcommerceSiteDB', obj: window.EcommerceSiteDB },
  { name: 'UniversalReviewExtractor', obj: window.UniversalReviewExtractor },
  { name: 'PPCSelectors', obj: window.PPCSelectors }
];

components.forEach(comp => {
  const status = comp.obj ? '✅' : '❌';
  console.log(`${status} ${comp.name}:`, comp.obj ? 'Available' : 'Not loaded');
});

// Test site detection
if (window.SiteDetectionUtils) {
  const siteInfo = window.SiteDetectionUtils.detectEcommerceSite(window.location.hostname);
  console.log('🎯 Detected site:', siteInfo ? siteInfo.name : 'Unknown');
}

// Test selectors
if (window.PPCSelectors) {
  const elements = window.PPCSelectors.findReviewElements(document);
  console.log('📦 Found review elements:', elements.length);
  
  if (elements.length > 0) {
    const sample = elements[0];
    const text = window.PPCSelectors.extractReviewText(sample, document);
    const rating = window.PPCSelectors.extractRating(sample, document);
    console.log('📝 Sample review:', {
      textLength: text?.length || 0,
      textPreview: text?.substring(0, 100) + '...',
      rating
    });
  }
}

console.log('=== Verification Complete ===');