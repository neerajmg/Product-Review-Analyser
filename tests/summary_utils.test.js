// Basic unit tests for schema validation & fallback summarization logic.
// Run with: npm test  (after adding the provided package.json)

import {
  SUMMARY_SCHEMA,
  validateAgainstSchema,
  coerceAndClean,
  extractFirstJsonBlock,
  sampleReviewsForPrompt,
  mockRewriteWithGemini,
  localFallback
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
  pros: Array.from({length:12}).map((_,i)=>({ label:'X'.repeat(150)+i, support_count:'3', example_ids:['a','b','c','d','e','f']})),
  cons: [{ label:'Bad battery life', support_count:'2', example_ids:['r1','r2','r3','r4','r5','r6']}],
  note_pros: 'p'.repeat(500),
  note_cons: 'c'.repeat(500)
};
const cleaned = coerceAndClean(dirty);
assert('coerceAndClean pros length <=8', cleaned.pros.length === 8);
assert('coerceAndClean label truncated', cleaned.pros[0].label.length <= 120);
assert('coerceAndClean example_ids truncated', cleaned.cons[0].example_ids.length <= 5);
assert('coerceAndClean note_pros truncated', cleaned.note_pros.length <= 200);

// 4. JSON block extraction
const messy = 'Intro text {"a":1, "b":{"c":2}} trailing noise } more';
assert('extractFirstJsonBlock finds block', extractFirstJsonBlock(messy) === '{"a":1, "b":{"c":2}}');

// 5. Sampling maxChars respected
const reviews = Array.from({length:20}).map((_,i)=>({ id:'r'+i, text:'text '.repeat(200) + i, rating: i%5 }));
const sampled = sampleReviewsForPrompt(reviews, 3000); // should cut off
const totalChars = sampled.reduce((a,r)=> a + r.text.length, 0);
assert('sampleReviewsForPrompt char budget', totalChars <= 3000 + 800); // allow single overrun chunk

// 6. Mock summarizer produces structure
const mockSummary = mockRewriteWithGemini(reviews.slice(0,5));
assert('mockRewriteWithGemini pros array', Array.isArray(mockSummary.pros));
assert('mockRewriteWithGemini cons array', Array.isArray(mockSummary.cons));

// 7. Local fallback summarizer
const fb = localFallback([{ text:'Great build quality and battery life', id:'1'}, { text:'Poor battery life and slow charging', id:'2'}]);
assert('localFallback structure', Array.isArray(fb.pros) && Array.isArray(fb.cons));
assert('localFallback has at least one pro or con', fb.pros.length + fb.cons.length > 0);

console.log(`\nTest Results: ${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
