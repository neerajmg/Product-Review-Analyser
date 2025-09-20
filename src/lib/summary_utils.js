// Summarization utilities (clean rewrite)
// Provides: SUMMARY_SCHEMA, validateAgainstSchema, extractFirstJsonBlock, sampleReviewsForPrompt,
// mockRewriteWithGemini, localFallback, coerceAndClean, heuristicAspectSummary

export const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['pros','cons','note_pros','note_cons'],
  properties: {
    pros: { type: 'array', maxItems: 8, items: { type:'object', required:['label','support_count','example_ids'], properties:{ label:{type:'string', maxLength:120}, support_count:{type:'number'}, example_ids:{ type:'array', items:{type:'string'} } } } },
    cons: { type: 'array', maxItems: 8, items: { type:'object', required:['label','support_count','example_ids'], properties:{ label:{type:'string', maxLength:120}, support_count:{type:'number'}, example_ids:{ type:'array', items:{type:'string'} } } } },
    note_pros: { type:'string' },
    note_cons: { type:'string' }
  }
};

export function validateAgainstSchema(obj, schema = SUMMARY_SCHEMA) {
  if (schema.type === 'object') {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (schema.required) for (const k of schema.required) if (!(k in obj)) return false;
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
  if (schema.type === 'string') return (typeof obj === 'string' || obj === null) && (!schema.maxLength || (obj && obj.length <= schema.maxLength));
  if (schema.type === 'number') return typeof obj === 'number' && !Number.isNaN(obj);
  return false;
}

export function extractFirstJsonBlock(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i=start;i<text.length;i++) {
    const ch = text[i];
    if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth===0) return text.slice(start, i+1); }
  }
  return null;
}

export function sampleReviewsForPrompt(reviews, max=40) {
  if (!Array.isArray(reviews)) return [];
  const uniq = new Map();
  for (const r of reviews) {
    const id = r.id || ('r_'+Math.random().toString(36).slice(2,8));
    if (!uniq.has(id)) uniq.set(id, { id, rating: r.rating, text: (r.text||'').slice(0,1000) });
    if (uniq.size >= max) break;
  }
  return [...uniq.values()];
}

// Simple mock model rewrite (placeholder for offline/ dev )
export function mockRewriteWithGemini(reviews) {
  // Use heuristic directly for now
  return heuristicAspectSummary(reviews);
}

// Local extremely naive fallback (frequency of nouns) retained for legacy chain
export function localFallback(reviews) {
  if (!Array.isArray(reviews) || !reviews.length) return { pros:[], cons:[], note_pros:'No reviews', note_cons:'No reviews'};
  const freq = new Map();
  for (const r of reviews.slice(0,120)) {
    const tokens = (r.text||'').toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>3);
    for (const t of tokens) freq.set(t, (freq.get(t)||0)+1);
  }
  const sorted = [...freq.entries()].sort((a,b)=> b[1]-a[1]).slice(0,10);
  const pros = sorted.slice(0,5).map(([w,c])=>({ label:w, support_count:c, example_ids:[] }));
  const cons = sorted.slice(5).map(([w,c])=>({ label:w, support_count:c, example_ids:[] }));
  return coerceAndClean({ pros, cons, note_pros:'', note_cons:'' });
}

// Phrase cleaning & final sanitation
export function coerceAndClean(obj) {
  // Pre-normalize structure before strict validation to avoid discarding salvageable data
  if (obj && typeof obj === 'object') {
    if (!Array.isArray(obj.pros)) obj.pros = Array.isArray(obj.pros)?obj.pros:[];
    if (!Array.isArray(obj.cons)) obj.cons = Array.isArray(obj.cons)?obj.cons:[];
    obj.pros = obj.pros.map(e=>({
      label: typeof e.label==='string'? e.label.slice(0,120):'',
      support_count: typeof e.support_count==='number'? e.support_count : parseInt(e.support_count,10)||1,
      example_ids: Array.isArray(e.example_ids)? e.example_ids.filter(x=>typeof x==='string').slice(0,10):[]
    }));
    obj.cons = obj.cons.map(e=>({
      label: typeof e.label==='string'? e.label.slice(0,120):'',
      support_count: typeof e.support_count==='number'? e.support_count : parseInt(e.support_count,10)||1,
      example_ids: Array.isArray(e.example_ids)? e.example_ids.filter(x=>typeof x==='string').slice(0,10):[]
    }));
    if (typeof obj.note_pros !== 'string') obj.note_pros = '';
    if (typeof obj.note_cons !== 'string') obj.note_cons = '';
  }
  // Try strict validation; if it fails we'll still attempt best-effort cleaning rather than discarding.
  const schemaOk = validateAgainstSchema({
    pros: obj.pros,
    cons: obj.cons,
    note_pros: obj.note_pros ?? '',
    note_cons: obj.note_cons ?? ''
  });
  const junkSingles = new Set(['thing','item','product','amazon','purchase','quality','issue','issues','problem','problems','experience','time']);
  function cleanList(list) {
    const out=[]; const seen=new Set();
    for (const entry of list) {
      let label = (entry.label||'').toLowerCase().trim();
      label = label.replace(/doesn['’]t/g,'does not').replace(/don['’]t/g,'do not').replace(/can['’]t/g,'cannot').replace(/n['’]t\b/g,' not');
      label = label.replace(/\b(it|they|this|that|these|those)\b/g,'').replace(/\s+/g,' ').trim();
      if (!label) continue;
      if (label.split(' ').length===1 && junkSingles.has(label)) continue;
      if (label.length<3) continue;
      if (label.length>120) label = label.slice(0,120);
      if (seen.has(label)) continue; seen.add(label);
      const support = typeof entry.support_count === 'number' ? entry.support_count : parseInt(entry.support_count,10) || 1;
      const example_ids = Array.isArray(entry.example_ids) ? entry.example_ids.slice(0,5) : [];
      out.push({ label, support_count: support, example_ids });
      if (out.length>=8) break; // enforce max early
    }
    return out;
  }
  let note_pros = (obj.note_pros||'').slice(0,200);
  let note_cons = (obj.note_cons||'').slice(0,200);
  const cleaned = { pros: cleanList(obj.pros||[]), cons: cleanList(obj.cons||[]), note_pros, note_cons };
  return cleaned;
}

// Heuristic aspect extraction (robust multi-step)
export function heuristicAspectSummary(reviews) {
  if (!Array.isArray(reviews) || !reviews.length) {
    return { pros:[], cons:[], note_pros:'No reviews', note_cons:'No reviews' };
  }
  const POS = new Set(['good','great','excellent','amazing','durable','sturdy','stable','bright','clear','lightweight','fast','quiet','smooth','easy','long','compact','useful','handy','sharp','powerful','reliable','efficient','strong','comfortable','value','worth','responsive','accurate','beautiful','bright','vibrant']);
  const NEG = new Set(['bad','poor','slow','noisy','loud','heavy','dull','weak','flimsy','short','difficult','hard','broken','defective','expensive','costly','confusing','fragile','rough','low','leaking','leak','scratch','scratches','crack','cracked','worse','hot','overheating','overheat','faulty','stopped','useless','dead']);
  const NEGATORS = new Set(['not','no','never','cannot','can\'t','cant','hardly']);
  const STOP = new Set(['the','and','for','with','this','that','these','those','have','has','had','was','were','will','would','could','should','about','after','before','into','from','over','under','very','really','also','just','still','been','are','its','it','they','them','their','on','of','or','in','to','is','as','at','by','an','a']);
  const KEEP_SINGLE = new Set(['battery','motor','design','display','screen','build','performance','quality','noise','portability','weight','size','cleaning','value','price','brightness','color','sound','fan','adapter','charger','power']);
  const BANNED_SINGLE = new Set(['one','any','use','using','basic','built','looking','plug','do','not','does','did','redacted','name']);
  const AUX_OR_FUNCTION = new Set(['does','do','did','is','are','was','were','not','can','cannot','cant','will','won','won\'t']);
  const CANON_MAP = new Map([
    ['does not work','not working'],
    ['did not work','not working'],
    ['not work','not working'],
    ["won't work",'not working'],
    ['cant work','not working'],
    ['can not work','not working']
  ]);
  const sentenceSplit = /[.!?]+/;
  function norm(text){
    return text.toLowerCase()
      .replace(/doesn['’]t/g,'does not')
      .replace(/isn['’]t/g,'is not')
      .replace(/can['’]t/g,'cannot')
      .replace(/won['’]t/g,'will not')
      .replace(/don['’]t/g,'do not')
      .replace(/didn['’]t/g,'did not')
      .replace(/ain['’]t/g,'is not');
  }
  const candidates = new Map(); // phrase -> {reviews:Set,pos:0,neg:0,occ:0,examples:Set}
  function addCandidate(phrase, reviewId, posInc, negInc){
    phrase = phrase.trim();
    if (!phrase || phrase.length<3) return;
    if (/^(this|that|also|have|has|really|very|nice|good)$/i.test(phrase)) return;
    // Drop pure auxiliary / negation fragments
    if (AUX_OR_FUNCTION.has(phrase)) return;
    if (/^(does|did|is|are|was|were) not$/.test(phrase)) return;
    if (/^(not|do not|does not|did not)$/.test(phrase)) return;
    if (/^t work$/.test(phrase)) return;
    const key = phrase.toLowerCase();
    let e = candidates.get(key);
    if (!e){ e={ phrase:key, reviews:new Set(), pos:0, neg:0, occ:0, examples:new Set() }; candidates.set(key,e);}    
    e.reviews.add(reviewId); e.pos+=posInc; e.neg+=negInc; e.occ++; if (e.examples.size<3) e.examples.add(reviewId);
  }
  function genNgrams(tokens){
    const out=[]; 
    for (let n=1;n<=3;n++) {
      for (let i=0;i<=tokens.length-n;i++) {
        const slice = tokens.slice(i,i+n);
        // trim stopwords at ends
        while (slice.length && STOP.has(slice[0])) slice.shift();
        while (slice.length && STOP.has(slice[slice.length-1])) slice.pop();
        if (!slice.length) continue;
        if (n===1 && !KEEP_SINGLE.has(slice[0]) && slice[0].length<5) continue;
        const phrase = slice.join(' ');
        if (/^[0-9]+$/.test(phrase)) continue;
        out.push(phrase);
      }
    }
    return out;
  }
  for (const r of reviews) {
    const ratingBias = r.rating != null ? (r.rating >=4 ? 0.6 : (r.rating <=2 ? -0.6 : 0)) : 0;
    const text = norm(r.text||'');
    const sentences = text.split(sentenceSplit).slice(0,120);
    for (const sRaw of sentences) {
      const s = sRaw.trim(); if (!s) continue;
      const tokens = s.split(/[^a-z0-9]+/).filter(t=>t);
      if (!tokens.length) continue;
      // sentiment within sentence
      let posHits=0, negHits=0, negatorPresent=false;
      for (const t of tokens){ if (POS.has(t)) posHits++; if (NEG.has(t)) negHits++; if (NEGATORS.has(t)) negatorPresent=true; }
      let score = (posHits - negHits) + ratingBias;
      if (negatorPresent) score -= 0.6; // shift toward negative if negation present
      const orientation = score > 0.4 ? 'pos' : (score < -0.4 ? 'neg' : null);
      // n-grams
      const ngrams = genNgrams(tokens);
      for (const ng of ngrams) {
        const w = ng.split(/\s+/);
        let p=0,n=0;
        for (const wTok of w){ if (POS.has(wTok)) p++; if (NEG.has(wTok)) n++; }
        // adjust for negators near this ngram in original sentence window
        if (negatorPresent && p>0 && n===0) { n += p; p=0; }
        if (orientation==='pos') p++; else if (orientation==='neg') n++;
        addCandidate(ng, r.id, p, n);
      }
      // pattern phrases (domain-specific aspect inference)
      if (/not\s+working/.test(s)) addCandidate('not working', r.id, 0, 2);
      if (/not\s+charging/.test(s)) addCandidate('not charging', r.id, 0, 2);
      if (/easy\s+to\s+clean/.test(s)) addCandidate('easy to clean', r.id, 2, 0);
      if (/easy\s+to\s+use/.test(s)) addCandidate('easy to use', r.id, 2, 0);
      if (/value\s+for\s+money/.test(s)) addCandidate('value for money', r.id, 2, 0);
      if (/worth\s+the\s+price/.test(s)) addCandidate('worth the price', r.id, 2, 0);
      if (/too\s+noisy/.test(s)) addCandidate('too noisy', r.id, 0, 2);
      if (/overheat|overheating|gets\s+hot/.test(s)) addCandidate('overheating', r.id, 0, 2);
      if (/battery\s+life/.test(s)) addCandidate('battery life', r.id, 2, 0);
      if (/(build|overall)\s+quality/.test(s)) addCandidate('build quality', r.id, 2, 0);
      if (/power\s+(adapter|plug|charger)/.test(s)) addCandidate('power adapter', r.id, 0, orientation==='neg'?2:0);
      if (/(screen|display)\s+(brightness|quality|clarity|size)/.test(s)) {
        const m = s.match(/(screen|display)\s+(brightness|quality|clarity|size)/);
        if (m) addCandidate(`${m[1]} ${m[2]}`, r.id, orientation==='neg'?0:2, orientation==='neg'?2:0);
      }
      if (/(charging|charge)\s+(speed|time)/.test(s)) addCandidate('charging speed', r.id, orientation==='neg'?0:2, orientation==='neg'?2:0);
      // Canonicalization for broken contractions (e.g., "does n t work" cases already normalized earlier but keep safety)
      if (/does\s+not\s+work/.test(s)) addCandidate('not working', r.id, 0, 2);
      if (/did\s+not\s+work/.test(s)) addCandidate('not working', r.id, 0, 2);
    }
  }
  // Consolidate: prefer longer phrases when they contain a shorter one with similar support
  const entries = [...candidates.values()];
  entries.sort((a,b)=> b.reviews.size - a.reviews.size || (b.pos+b.neg) - (a.pos+a.neg));
  const dropped = new Set();
  // First, drop single tokens if a multi-word containing them has reasonable support
  const byPhrase = new Map(entries.map(e=>[e.phrase,e]));
  for (const e of entries) {
    if (e.phrase.split(' ').length===1) {
      for (const longer of entries) {
        if (longer.phrase.split(' ').length>1 && longer.phrase.includes(e.phrase)) {
          if (longer.reviews.size >= e.reviews.size * 0.6) {
            dropped.add(e.phrase); break;
          }
        }
      }
    }
  }
  // Original containment rule (keep multi-word dominance) still applies
  for (let i=0;i<entries.length;i++) {
    if (dropped.has(entries[i].phrase)) continue;
    for (let j=i+1;j<entries.length;j++) {
      if (dropped.has(entries[j].phrase)) continue;
      if (entries[i].phrase.includes(entries[j].phrase) && entries[j].phrase.split(' ').length===1 && entries[i].phrase.split(' ').length>1) {
        dropped.add(entries[j].phrase);
      }
    }
  }
  const pros=[]; const cons=[];
  for (const e of entries){
    if (dropped.has(e.phrase)) continue;
    if (/redacted/.test(e.phrase)) continue;
    if (e.phrase === 'do not' || e.phrase === 'does not') continue;
    if (e.phrase.split(' ').length===1 && BANNED_SINGLE.has(e.phrase)) continue;
    // Canonical mapping (merge counts into canonical phrase)
    const canon = CANON_MAP.get(e.phrase);
    if (canon) {
      let target = candidates.get(canon);
      if (!target) {
        target = { phrase: canon, reviews:new Set(), pos:0, neg:0, occ:0, examples:new Set() };
        candidates.set(canon, target);
      }
      e.reviews.forEach(rid=>target.reviews.add(rid));
      target.pos += e.pos; target.neg += e.neg; target.occ += e.occ;
      e._consumed = true;
      continue;
    }
    const support = e.reviews.size;
    const polarity = e.pos - e.neg;
    // classify
    let bucket=null;
    if (polarity > 1) bucket='pros'; else if (polarity < -1) bucket='cons';
    else {
      if (polarity > 0.5 && support>=2) bucket='pros';
      else if (polarity < -0.5 && support>=1) bucket='cons';
    }
    // fallback: strongly negative words present
    if (!bucket && /not |too |overheating|faulty|broken|defective|noisy|difficult|hard/.test(e.phrase) && support>=1 && (e.neg>0 || polarity<0)) bucket='cons';
    if (!bucket && /(easy to|value for money|worth the price|smooth|quiet|durable|sturdy)/.test(e.phrase) && (e.pos>0 || polarity>0.5)) bucket='pros';
    if (!bucket) continue;
    const obj = { label: e.phrase, support_count: support, example_ids: [...e.examples] };
    if (bucket==='pros') pros.push(obj); else cons.push(obj);
  }
  // Ensure diversity: limit duplicates starting with same first token
  function dedupe(list){
    const seenFirst = new Set();
    const out=[];
    for (const item of list.sort((a,b)=> b.support_count - a.support_count || a.label.localeCompare(b.label))) {
      const first = item.label.split(' ')[0];
      if (seenFirst.has(first) && item.label.split(' ').length === 1) continue;
      seenFirst.add(first);
      out.push(item);
      if (out.length>=8) break;
    }
    return out;
  }
  const finalPros = dedupe(pros);
  let finalCons = dedupe(cons);
  // Cluster consolidation for power/charging elements
  function clusterReplace(list, tokens, label){
    const members = list.filter(i=> tokens.some(t=> i.label===t));
    if (members.length>=2) {
      const support = new Set(); const examples = new Set();
      for (const m of members){ support.add(m.support_count); (m.example_ids||[]).forEach(id=>examples.add(id)); }
      const totalSupport = members.reduce((a,b)=> a + b.support_count, 0);
      list = list.filter(i=> !members.includes(i));
      list.unshift({ label, support_count: totalSupport, example_ids:[...examples].slice(0,5) });
    }
    return list;
  }
  finalCons = clusterReplace(finalCons, ['power','adapter','charger','plug'], 'power / charging issues');
  // Remove leftover banned singles after clustering
  function purgeSingles(list){ return list.filter(i=> !(i.label.split(' ').length===1 && BANNED_SINGLE.has(i.label))); }
  let cleanedPros = purgeSingles(finalPros);
  const cleanedCons = purgeSingles(finalCons);
  // Ensure at least one multi-word pro if any multi-word candidate exists
  if (cleanedPros.length && cleanedPros.every(p=> p.label.split(' ').length===1)) {
    const multi = entries.filter(e=> !dropped.has(e.phrase) && !BANNED_SINGLE.has(e.phrase) && e.phrase.split(' ').length>1 && (e.pos - e.neg) > 0).sort((a,b)=> b.reviews.size - a.reviews.size)[0];
    if (multi) {
      cleanedPros.unshift({ label: multi.phrase, support_count: multi.reviews.size, example_ids:[...multi.examples].slice(0,3) });
      // Remove duplicate single if exceeding limit handled by coerce later
    }
  }
  // If still no cons, relax negative threshold: pick top negative-leaning phrases not already in pros
  if (!cleanedCons.length) {
    const negCandidates = entries.filter(e=> !dropped.has(e.phrase) && !cleanedPros.find(p=>p.label===e.phrase) && (e.neg>0 || /(not |no |too |overheating|faulty|broken|defective|noisy|difficult|hard)/.test(e.phrase)) ).slice(0,6);
    cleanedCons.push(...negCandidates.map(e=> ({ label: e.phrase, support_count: e.reviews.size, example_ids:[...e.examples] })));
  }
  if (globalThis && globalThis.__PPC_DEBUG_SUMMARY) {
    globalThis.__PPC_DEBUG_SUMMARY.last = { rawCandidates: entries.slice(0,50).map(e=>({ phrase:e.phrase, support:e.reviews.size, pos:e.pos, neg:e.neg })) };
  }
  return coerceAndClean({ pros: cleanedPros, cons: cleanedCons, note_pros:'', note_cons:'' });
}

// Expose debug namespace (optional)
if (typeof globalThis !== 'undefined' && !globalThis.__PPC_DEBUG_SUMMARY) {
  globalThis.__PPC_DEBUG_SUMMARY = { enabled: false };
}
