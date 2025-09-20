// Basic unit tests for schema validation & fallback summarization logic.
// Run with: npm test  (after adding the provided package.json)

import {
  SUMMARY_SCHEMA,
  validateAgainstSchema,
  coerceAndClean,
  extractFirstJsonBlock,
  sampleReviewsForPrompt,
  mockRewriteWithGemini,
  localFallback,
  heuristicAspectSummary
} from '../src/lib/summary_utils.js';

function assert(name, condition) {
  if (!condition) {
    console.error('FAIL:', name);
    failures++;
  } else {
    passes++;
    console.log('PASS:', name);
  }
}

let passes = 0, failures = 0;

// 1. Schema validation happy path
assert('validateAgainstSchema valid minimal', validateAgainstSchema({ pros:[], cons:[], note_pros:'', note_cons:'' }));

// 2. Schema validation missing field
assert('validateAgainstSchema missing pros', !validateAgainstSchema({ cons:[], note_pros:'', note_cons:'' }));

// 3. Coercion trims and limits
const dirty = {
  pros: Array.from({length:12}).map((_,i)=>({ label:('Very Long Aspect Label '.repeat(6))+i, support_count:'3', example_ids:['a','b','c','d','e','f']})),
  cons: [{ label:'Extremely noisy motor overheating frequently', support_count:'2', example_ids:['r1','r2','r3','r4','r5','r6']}],
  note_pros: 'p'.repeat(500),
  note_cons: 'c'.repeat(500)
};
const cleaned = coerceAndClean(dirty);
assert('coerceAndClean pros length trimmed to <=8', cleaned.pros.length > 0 && cleaned.pros.length <= 8);
if (cleaned.pros[0]) assert('coerceAndClean label truncated', cleaned.pros[0].label.length <= 120);
if (cleaned.cons[0]) assert('coerceAndClean example_ids truncated', cleaned.cons[0].example_ids.length <= 5);
assert('coerceAndClean note_pros truncated', cleaned.note_pros.length <= 200);

// 4. JSON block extraction
const messy = 'Intro text {"a":1, "b":{"c":2}} trailing noise } more';
assert('extractFirstJsonBlock finds block', extractFirstJsonBlock(messy) === '{"a":1, "b":{"c":2}}');

// 5. Sampling respects max review count parameter (not char budget in current impl)
const reviews = Array.from({length:50}).map((_,i)=>({ id:'r'+i, text:'text '.repeat(50) + i, rating: i%5 }));
const sampled = sampleReviewsForPrompt(reviews, 10);
assert('sampleReviewsForPrompt count <= max', sampled.length <= 10);

// 6. Mock summarizer produces structure
const mockSummary = mockRewriteWithGemini(reviews.slice(0,5));
assert('mockRewriteWithGemini pros array', Array.isArray(mockSummary.pros));
assert('mockRewriteWithGemini cons array', Array.isArray(mockSummary.cons));

// 7. Local fallback summarizer
const fb = localFallback([{ text:'Great build quality and battery life', id:'1'}, { text:'Poor battery life and slow charging', id:'2'}]);
assert('localFallback structure', Array.isArray(fb.pros) && Array.isArray(fb.cons));
assert('localFallback has at least one pro or con', fb.pros.length + fb.cons.length > 0);

// 8. Heuristic: multi-word preference over single generic token
const hwReviews = [
  { id:'h1', rating:5, text:'Battery life is excellent and build quality is great.' },
  { id:'h2', rating:5, text:'The battery life and build quality together make it worth the price.' },
  { id:'h3', rating:4, text:'Really good battery life overall.' }
];
const hSummary = heuristicAspectSummary(hwReviews);
assert('heuristicAspectSummary multi-word present', hSummary.pros.some(p=>/battery life/.test(p.label)));
assert('heuristicAspectSummary not only single generic adjective', !hSummary.pros.every(p=>p.label.split(' ').length === 1));

// 9. Heuristic: detect cons when negative evidence exists
const negReviews = [
  { id:'n1', rating:2, text:'The motor is noisy and build is flimsy.' },
  { id:'n2', rating:1, text:'Really noisy motor that gets hot.' },
  { id:'n3', rating:4, text:'Powerful motor but a bit noisy.' }
];
const negSummary = heuristicAspectSummary(negReviews);
assert('heuristicAspectSummary cons non-empty with negative evidence', negSummary.cons.length > 0);
assert('heuristicAspectSummary includes noisy motor style phrase', negSummary.cons.some(c=>/noisy|overheating/.test(c.label)));

// 10. Heuristic: fallback cons when mostly positive but one clear negative
const sparseNeg = [
  { id:'p1', rating:5, text:'Excellent screen and vibrant color reproduction.' },
  { id:'p2', rating:5, text:'Great screen brightness and color accuracy.' },
  { id:'p3', rating:5, text:'Color accuracy is amazing and screen is bright.' },
  { id:'p4', rating:3, text:'Screen is bright but gets hot sometimes.' }
];
const sparseNegSummary = heuristicAspectSummary(sparseNeg);
assert('heuristicAspectSummary fallback negative captured', sparseNegSummary.cons.some(c=>/hot|overheating/.test(c.label)));

console.log(`\nTest Results: ${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
