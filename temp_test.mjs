import {coerceAndClean} from './src/lib/summary_utils.js';
const dirty={
 pros:Array.from({length:12}).map((_,i)=>({label:('Very Long Aspect Label '.repeat(6))+i,support_count:'3',example_ids:['a','b','c','d','e','f']})),
 cons:[{label:'Extremely noisy motor overheating frequently',support_count:'2',example_ids:['r1','r2','r3','r4','r5','r6']}],
 note_pros:'p'.repeat(500),note_cons:'c'.repeat(500)
};
console.log(JSON.stringify(coerceAndClean(dirty),null,2));
