/**
 * Basic Selector Test (manual / rudimentary)
 * Open this file content in a browser console *after* loading selectors.js in the page OR run via Node with jsdom (advanced).
 */

(function(){
  const selectors = typeof require === 'function' ? require('../src/selectors.js') : window.PPCSelectors;
  if (!selectors) { console.error('Selectors not available'); return; }
  // Create a fake DOM block (browser context only)
  const container = document.createElement('div');
  container.innerHTML = `
    <div id="cm_cr-review_list">
      <div class="review" id="R1">
        <span class="a-icon-alt">5.0 out of 5 stars</span>
        <span class="review-text-content">Amazing battery life and crisp screen.</span>
      </div>
      <div class="review" id="R2">
        <span class="a-icon-alt">3.0 out of 5 stars</span>
        <span class="review-text-content">Average performance, decent value.</span>
      </div>
    </div>`;
  document.body.appendChild(container);
  const found = selectors.findReviewElements(container);
  console.log('TEST: found review count =', found.length);
  if (found.length !== 2) console.error('Expected 2 reviews');
  const firstText = selectors.extractReviewText(found[0]);
  if (!/battery life/i.test(firstText)) console.error('First review text mismatch');
  const rating = selectors.extractRating(found[0]);
  if (rating !== 5.0) console.error('Rating parse failed'); else console.log('Rating OK');
})();
