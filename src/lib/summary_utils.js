// Pure summarization utilities extracted for testability.
// Shared between background service worker and unit tests.

export const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['pros','cons','note_pros','note_cons'],
  properties: {
    pros: { type: 'array', maxItems: 8, items: { type: 'object', required:['label','support_count','example_ids'], properties:{ label:{type:'string', maxLength:120}, support_count:{type:'number'}, example_ids:{type:'array', items:{type:'string'}} } } },
    cons: { type: 'array', maxItems: 8, items: { type: 'object', required:['label','support_count','example_ids'], properties:{ label:{type:'string', maxLength:120}, support_count:{type:'number'}, example_ids:{type:'array', items:{type:'string'}} } } },
    note_pros: { type:'string' },
    note_cons: { type:'string' }
  }
};

export function validateAgainstSchema(obj, schema = SUMMARY_SCHEMA) {
  if (schema.type === 'object') {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (schema.required) {
      for (const k of schema.required) if (!(k in obj)) return false;
    }
    if (schema.properties) {
      for (const [k, def] of Object.entries(schema.properties)) {
        if (obj[k] === undefined) continue;
        if (!validateAgainstSchema(obj[k], def)) return false;
      }
    }
    return true;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(obj)) return false;
    if (schema.maxItems !== undefined && obj.length > schema.maxItems) return false;
    if (schema.items) return obj.every(it => validateAgainstSchema(it, schema.items));
    return true;
  }
  if (schema.type === 'string') return typeof obj === 'string' && (schema.maxLength ? obj.length <= schema.maxLength : true);
  if (schema.type === 'number') return typeof obj === 'number' && !Number.isNaN(obj);
  return false;
}

export function coerceAndClean(summary) {
  const safeArr = (arr) => Array.isArray(arr) ? arr.filter(x => x && typeof x.label === 'string').slice(0,8).map(x => ({
    label: String(x.label).slice(0,120),
    support_count: Math.max(0, Number(x.support_count)||0),
    example_ids: Array.isArray(x.example_ids) ? x.example_ids.filter(id => typeof id === 'string').slice(0,5) : []
  })) : [];
  return {
    pros: safeArr(summary.pros),
    cons: safeArr(summary.cons),
    note_pros: summary.note_pros && typeof summary.note_pros === 'string' ? summary.note_pros.slice(0,200) : (summary.pros && summary.pros.length? '' : 'No pros found'),
    note_cons: summary.note_cons && typeof summary.note_cons === 'string' ? summary.note_cons.slice(0,200) : (summary.cons && summary.cons.length? '' : 'No cons found')
  };
}

export function extractFirstJsonBlock(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i=start; i<text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i+1);
      }
    }
  }
  return null;
}

export function sampleReviewsForPrompt(reviews, maxChars = 12000) {
  if (!Array.isArray(reviews) || !reviews.length) return [];
  const buckets = new Map();
  for (const r of reviews) {
    const key = r.rating != null ? String(r.rating) : 'na';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  for (const b of buckets.values()) b.sort((a,b)=> (b.text||'').length - (a.text||'').length);
  const ordered = Array.from(buckets.values()).flat();
  let acc = []; let total = 0;
  for (const r of ordered) {
    const chunk = (r.text||'').slice(0,800);
    if (total + chunk.length > maxChars) break;
    acc.push({ id: r.id, text: chunk, rating: r.rating });
    total += chunk.length;
  }
  return acc;
}

export function mockRewriteWithGemini(reviews) {
  const freq = new Map();
  for (const r of reviews) {
    const words = (r.text || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 5);
    const unique = new Set(words);
    for (const w of unique) freq.set(w, (freq.get(w) || 0) + 1);
  }
  const sorted = [...freq.entries()].sort((a,b)=> b[1]-a[1]).slice(0,8);
  const mid = Math.ceil(sorted.length/2);
  const pros = sorted.slice(0,mid).map(([label,count],i)=>({label, support_count: count, example_ids: reviews.slice(i,i+2).map(r=>r.id).filter(Boolean)}));
  const cons = sorted.slice(mid).map(([label,count],i)=>({label, support_count: count, example_ids: reviews.slice(i,i+1).map(r=>r.id).filter(Boolean)}));
  return { pros, cons, note_pros: pros.length? '' : 'No pros found', note_cons: cons.length? '' : 'No cons found' };
}

export function localFallback(reviews) {
  const counts = new Map();
  for (const r of reviews) {
    const tokens = (r.text || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4);
    for (let i=0;i<tokens.length-1;i++) {
      const bigram = tokens[i] + ' ' + tokens[i+1];
      counts.set(bigram, (counts.get(bigram)||0)+1);
    }
  }
  const top = [...counts.entries()].sort((a,b)=> b[1]-a[1]).slice(0,10);
  const half = Math.ceil(top.length/2);
  const pros = top.slice(0,half).map(([label,c])=>({label, support_count:c, example_ids:[]}));
  const cons = top.slice(half).map(([label,c])=>({label, support_count:c, example_ids:[]}));
  return { pros, cons, note_pros: pros.length? '' : 'No pros found', note_cons: cons.length? '' : 'No cons found' };
}
