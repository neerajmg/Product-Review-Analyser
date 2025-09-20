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
  const scrub = (label) => label
    .replace(/\b(name|product|redacted|brand)\b/gi,'')
    .replace(/\s{2,}/g,' ') // collapse spaces
    .trim();
  const WHITELIST_SINGLE = new Set(['battery','battery life','motor','noise','noise level','design','warranty','durability','speed','weight','size','build quality','performance','grinder','grinding','power','taste','flavor','texture','cleaning','ease of use','value','price']);
  // Consolidate overlapping / nested phrases (e.g. "battery" & "battery life" => keep longer) and merge evidence.
  function consolidatePhrases(items) {
    const kept = [];
    function escapeReg(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
    for (const item of items.sort((a,b)=> b.label.length - a.label.length || b.support_count - a.support_count)) {
      const lower = item.label.toLowerCase();
      let merged = false;
      for (const k of kept) {
        const pattern = new RegExp('\\b'+escapeReg(lower)+'\\b','i');
        if (pattern.test(k.label.toLowerCase())) {
          // current item is a subset of an already kept longer phrase -> drop entirely
          merged = true; break;
        }
        // If kept phrase is subset of current longer phrase, upgrade kept phrase
        const revPattern = new RegExp('\\b'+escapeReg(k.label.toLowerCase())+'\\b','i');
        if (revPattern.test(lower) && item.support_count >= k.support_count) {
          // replace k with longer item (merge metadata)
            const newExampleIds = [...k.example_ids];
            for (const id of (item.example_ids||[])) if (newExampleIds.length <5 && !newExampleIds.includes(id)) newExampleIds.push(id);
            k.label = item.label; k.support_count = item.support_count; k.example_ids = newExampleIds;
            merged = true; break;
        }
      }
      if (!merged) kept.push({...item});
    }
    return kept;
  }
  const filterMeaningful = (items) => items
    .map(it => ({ ...it, label: scrub(it.label)}))
    .filter(it => {
      if (!it.label || it.label.length < 3) return false;
      if (/^[0-9]+$/.test(it.label)) return false;
      const words = it.label.split(/\s+/);
      if (words.length === 1) {
        const lower = it.label.toLowerCase();
        // Allow if whitelisted OR sufficiently supported & not a generic adjective
        if (!WHITELIST_SINGLE.has(lower)) {
          if (!(it.support_count >= 3 && lower.length >= 4 && !/^(good|great|nice|very|really|also|have|has)$/i.test(lower))) return false;
        }
      }
      if (/^(this|that|these|those|have|also|like|good|great|nice|really|very)$/i.test(it.label)) return false;
      return true;
    })
    // consolidate nested phrases after filtering
    ;
  const prosRaw = safeArr(summary.pros);
  const consRaw = safeArr(summary.cons);
  const pros = consolidatePhrases(filterMeaningful(prosRaw)).slice(0,8);
  const cons = consolidatePhrases(filterMeaningful(consRaw)).slice(0,8);
  return {
    pros,
    cons,
    note_pros: pros.length ? (summary.note_pros && typeof summary.note_pros === 'string' ? summary.note_pros.slice(0,200) : '') : 'No pros found',
    note_cons: cons.length ? (summary.note_cons && typeof summary.note_cons === 'string' ? summary.note_cons.slice(0,200) : '') : 'No cons found'
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
  const STOP = new Set(['about','after','again','because','could','therefore','should','might','their','which','would','product','quality','feature','features','great','really','thing','items','having','review','reviews','amazon','india','price','value','money','works','working','using','usage','model','brand','bought','purchase','purchased','thanks','delivery','arrived','packaging','seller','color']);
  const freq = new Map();
  for (const r of reviews) {
    const words = (r.text || '').toLowerCase()
      .replace(/\b(replaced|issue|issues)\b/g,'issue')
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 3 && w.length < 30 && !STOP.has(w) && !/^\d+$/.test(w));
    const unique = new Set(words);
    for (const w of unique) freq.set(w, (freq.get(w) || 0) + 1);
  }
  const candidates = [...freq.entries()].filter(([w,c]) => c > 1).sort((a,b)=> b[1]-a[1]).slice(0,14);
  const mid = Math.ceil(candidates.length/2);
  const make = (arr, offset) => arr.map(([label,count],i)=>({label, support_count: count, example_ids: reviews.slice((offset+i)%reviews.length, (offset+i)%reviews.length+1).map(r=>r.id).filter(Boolean)}));
  const pros = make(candidates.slice(0,mid),0);
  const cons = make(candidates.slice(mid),mid);
  return coerceAndClean({ pros, cons, note_pros:'', note_cons:'' });
}

export function localFallback(reviews) {
  const counts = new Map();
  const STOP_BG = /\b(name|product|brand|amazon|india|price|value|good|great|very|really|thing|items|works?)\b/i;
  for (const r of reviews) {
    const tokens = (r.text || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !/^\d+$/.test(t));
    for (let i=0;i<tokens.length-1;i++) {
      const bigram = tokens[i] + ' ' + tokens[i+1];
      if (STOP_BG.test(bigram)) continue;
      counts.set(bigram, (counts.get(bigram)||0)+1);
    }
  }
  const top = [...counts.entries()].filter(([b,c])=> c>1).sort((a,b)=> b[1]-a[1]).slice(0,12);
  const half = Math.ceil(top.length/2);
  const pros = top.slice(0,half).map(([label,c])=>({label, support_count:c, example_ids:[]}));
  const cons = top.slice(half).map(([label,c])=>({label, support_count:c, example_ids:[]}));
  return coerceAndClean({ pros, cons, note_pros:'', note_cons:'' });
}

// Aspect-oriented heuristic summarizer (used when no API key) to produce more logical pros/cons
export function heuristicAspectSummary(reviews) {
  if (!Array.isArray(reviews) || !reviews.length) return { pros:[], cons:[], note_pros:'No pros found', note_cons:'No cons found' };
  const POS_LEX = new Set(['good','great','excellent','amazing','durable','sturdy','stable','bright','clear','lightweight','fast','quiet','smooth','easy','long','compact','useful','handy','sharp','powerful','reliable','efficient','strong','comfortable']);
  const NEG_LEX = new Set(['bad','poor','slow','noisy','loud','heavy','dull','weak','flimsy','short','difficult','hard','broken','defective','expensive','costly','confusing','fragile','rough','low','leaking','leak','scratch','scratches','crack','cracked','worse']);
  const STOP = new Set(['the','and','for','with','this','that','these','those','have','has','had','was','were','will','would','could','should','about','after','before','into','from','over','under','very','really','also','just','still','been','are','its','it','they','them','their','on','of','or','in','to','is','as','at']);
  const ASPECT_SINGLE_WHITELIST = new Set(['battery','motor','durability','design','noise','warranty','weight','size','performance','quality','grinder','grinding','power','taste','flavor','texture','cleaning','ease','value','price','build']);
  const phraseMap = new Map(); // key -> { phrase, reviews:Set, pos:0, neg:0, examples:Set }
  const SENT_SPLIT = /[.!?]+/;
  function singularize(token){
    if (token.endsWith('ies') && token.length>4) return token.slice(0,-3)+'y';
    if (token.endsWith('es') && token.length>3) return token.slice(0,-2);
    if (token.endsWith('s') && token.length>3) return token.slice(0,-1);
    return token;
  }
  function addPhrase(rawPhrase, reviewId, orientation) {
    const phrase = rawPhrase.trim();
    if (!phrase || phrase.length < 3) return;
    if (/^(this|that|also|have|has|good|great|nice|really|very)$/i.test(phrase)) return;
    const key = phrase.toLowerCase();
    let entry = phraseMap.get(key);
    if (!entry) { entry = { phrase, reviews:new Set(), pos:0, neg:0, examples:new Set() }; phraseMap.set(key, entry); }
    entry.reviews.add(reviewId);
    if (orientation === 'pos') entry.pos++; else if (orientation === 'neg') entry.neg++;
    if (entry.examples.size < 3) entry.examples.add(reviewId);
  }
  for (const r of reviews) {
    const text = (r.text||'').toLowerCase();
    const ratingBias = r.rating != null ? (r.rating >=4 ? 0.6 : (r.rating <=2 ? -0.6 : 0)) : 0;
    const sentences = text.split(SENT_SPLIT).slice(0,60);
    for (const s of sentences) {
      const tokens = s.split(/[^a-z0-9]+/).filter(t => t && t.length<40);
      if (!tokens.length) continue;
      // Determine sentence sentiment orientation heuristic
      let posHits=0, negHits=0;
      for (const t of tokens) { if (POS_LEX.has(t)) posHits++; else if (NEG_LEX.has(t)) negHits++; }
      const sentimentScore = (posHits - negHits) + ratingBias;
      const orientation = sentimentScore > 0.3 ? 'pos' : (sentimentScore < -0.3 ? 'neg' : null);
      // Build candidate bigrams/trigrams biased toward nouns (approx by excluding stopwords edges)
      for (let i=0;i<tokens.length;i++) {
        const t1 = tokens[i]; if (!t1) continue;
        if (STOP.has(t1) && !ASPECT_SINGLE_WHITELIST.has(t1)) continue;
        const singles = singularize(t1);
        if (!STOP.has(t1) && (ASPECT_SINGLE_WHITELIST.has(t1) || t1.length>4)) addPhrase(singles, r.id, orientation);
        // bigram
        if (i+1<tokens.length) {
          const t2 = tokens[i+1]; if (!t2) continue;
          if (STOP.has(t2)) continue;
          const bigram = singularize(t1)+' '+singularize(t2);
          if (!/\b(?:the|and|for)\b/.test(bigram)) addPhrase(bigram, r.id, orientation);
          // adjective+noun pattern for negative emphasis (e.g., noisy motor, flimsy build, short battery life)
          if (NEG_LEX.has(t1) && !STOP.has(t2)) addPhrase(t1+' '+t2, r.id, 'neg');
          if (POS_LEX.has(t1) && !STOP.has(t2)) addPhrase(t1+' '+t2, r.id, 'pos');
        }
        // trigram
        if (i+2<tokens.length) {
          const t2 = tokens[i+1], t3 = tokens[i+2];
            if (STOP.has(t2) || STOP.has(t3)) continue;
            const trigram = singularize(t1)+' '+singularize(t2)+' '+singularize(t3);
            addPhrase(trigram, r.id, orientation);
            // special handling: short battery life pattern
            if ((t1==='short' || t1==='long') && t2==='battery' && t3==='life') {
              addPhrase(t1+' battery life', r.id, t1==='short' ? 'neg':'pos');
            }
        }
        // cleaning difficulty phrases
        if (t1==='cleaning' && i+1<tokens.length) {
          const t2 = tokens[i+1];
          if (t2==='difficult' || t2==='hard') addPhrase('cleaning difficult', r.id, 'neg');
        }
      }
    }
  }
  // Canonical merge of similar phrases (order-insensitive for small sets) to reduce duplicates
  const LINKING = new Set(['became','is','was','were','be','been','being','very','really','quite','too']);
  const mergedMap = new Map();
  for (const [key, entry] of phraseMap.entries()) {
    const tokens = entry.phrase.toLowerCase().split(/\s+/).filter(t => t && !LINKING.has(t));
    let canonKey = null;
    if (tokens.length > 1 && tokens.length <= 3) {
      const sorted = [...tokens].sort();
      canonKey = sorted.join('|');
    }
    if (!canonKey) { mergedMap.set(key, entry); continue; }
    let existing = mergedMap.get(canonKey);
    if (!existing) {
      // choose representative phrase: prefer one without linking words and shorter token count
      existing = { ...entry };
      mergedMap.set(canonKey, existing);
    } else {
      // merge stats
      for (const rId of entry.reviews) existing.reviews.add(rId);
      existing.pos += entry.pos;
      existing.neg += entry.neg;
      for (const ex of entry.examples) if (existing.examples.size < 3) existing.examples.add(ex);
      // choose better phrase (fewer tokens or no linking words)
      const existingTokens = existing.phrase.split(/\s+/).filter(Boolean);
      const candTokens = entry.phrase.split(/\s+/).filter(Boolean);
      const existingHasLink = existingTokens.some(t=>LINKING.has(t.toLowerCase()));
      const candHasLink = candTokens.some(t=>LINKING.has(t.toLowerCase()));
      if ((candTokens.length < existingTokens.length) || (existingHasLink && !candHasLink)) {
        existing.phrase = entry.phrase;
      }
    }
  }
  // Replace phraseMap values with merged results if any merges occurred
  if (mergedMap.size) {
    // If mergedMap keys are canonical compound keys, keep their entry under a synthetic key of phrase
    const newPhraseMap = new Map();
    for (const v of mergedMap.values()) newPhraseMap.set(v.phrase.toLowerCase(), v);
    phraseMap.clear();
    for (const [k,v] of newPhraseMap.entries()) phraseMap.set(k,v);
  }
  // Aggregate and classify
  const pros=[]; const cons=[];
  for (const entry of phraseMap.values()) {
    const support = entry.reviews.size;
    if (support < 2) {
      // Allow strong negative singletons from low-rated context
      if (!(entry.neg>=1 && /(noisy|short|flimsy|weak|difficult|hard|broken|defective|scratch|crack|leak|leaking|expensive)/.test(entry.phrase))) continue;
    }
    const net = entry.pos - entry.neg;
    let bucket=null;
    if (net > 0.3) bucket='pros'; else if (net < -0.3) bucket='cons';
    else {
      // tie-break using average polarity ratio
      if (entry.pos > entry.neg) bucket='pros'; else if (entry.neg > entry.pos) bucket='cons'; else {
        // If still neutral but strong support, infer from majority of associated ratings if available
        if (support >= 3) {
          // crude heuristic: if most related reviews are high rated treat as pro, low rated as con
          bucket = 'pros'; // optimistic default
          if (entry.neg > entry.pos) bucket='cons';
        }
      }
    }
    // direct override: if phrase contains a negative adjective and has any neg evidence
    if (!bucket && /\b(noisy|short|flimsy|weak|difficult|hard|broken|defective|scratch|crack|leak|leaking|expensive)\b/.test(entry.phrase) && entry.neg>=1) bucket='cons';
    if (!bucket) continue;
    const obj = { label: entry.phrase, support_count: support, example_ids: [...entry.examples] };
    if (bucket==='pros') pros.push(obj); else cons.push(obj);
  }
  // Post-pass: move obviously negative lexical phrases into cons if misbucketed
  const NEG_HINT = /(noisy|short|difficult|hard|flimsy|weak|broken|defective|scratch|crack|leak|leaking|expensive)/i;
  for (let i=pros.length-1; i>=0; i--) {
    if (NEG_HINT.test(pros[i].label) && !cons.find(c=>c.label===pros[i].label)) {
      cons.push(pros[i]); pros.splice(i,1);
    }
  }
  // Likewise move strongly positive that slipped into cons
  const POS_HINT = /(quiet|long|durable|sturdy|stable|easy|comfortable|powerful|reliable|efficient|sharp)/i;
  for (let i=cons.length-1; i>=0; i--) {
    if (POS_HINT.test(cons[i].label) && !pros.find(p=>p.label===cons[i].label)) {
      pros.push(cons[i]); cons.splice(i,1);
    }
  }
  // Fallback: if cons empty, allow inclusion of single-support negative phrases
  if (!cons.length) {
    const negativeSingles = [];
    for (const entry of phraseMap.values()) {
      if (entry.reviews.size === 1 && entry.neg > 0 && /(noisy|short|flimsy|weak|difficult|hard|broken|defective|scratch|crack|leak|leaking|expensive)/.test(entry.phrase)) {
        negativeSingles.push({ label: entry.phrase, support_count: entry.reviews.size, example_ids: [...entry.examples] });
      }
    }
    negativeSingles.sort((a,b)=> b.support_count - a.support_count || a.label.localeCompare(b.label));
    cons.push(...negativeSingles.slice(0,5));
  }
  // Fallback: if pros empty, include top frequent neutral/positive phrases
  if (!pros.length) {
    const positiveSingles = [];
    for (const entry of phraseMap.values()) {
      if (entry.reviews.size === 1 && entry.pos > 0 && /(long|quiet|durable|sturdy|easy|comfortable|powerful|reliable|efficient|sharp|fast|lightweight)/.test(entry.phrase)) {
        positiveSingles.push({ label: entry.phrase, support_count: entry.reviews.size, example_ids: [...entry.examples] });
      }
    }
    positiveSingles.sort((a,b)=> b.support_count - a.support_count || a.label.localeCompare(b.label));
    pros.push(...positiveSingles.slice(0,5));
  }
  pros.sort((a,b)=> b.support_count - a.support_count || a.label.localeCompare(b.label));
  cons.sort((a,b)=> b.support_count - a.support_count || a.label.localeCompare(b.label));
  return coerceAndClean({ pros:pros.slice(0,14), cons:cons.slice(0,14), note_pros:'', note_cons:'' });
}
