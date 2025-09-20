import { heuristicAspectSummary, mockRewriteWithGemini, localFallback } from '../src/lib/summary_utils.js';

const sampleReviews = [
  { id:'r1', rating:5, text:'Battery life is excellent and the motor is powerful yet quiet. Really great build quality.' },
  { id:'r2', rating:4, text:'Powerful motor and long battery life. Design feels sturdy.' },
  { id:'r3', rating:5, text:'Fantastic battery life. Very quiet motor, cleaning is easy.' },
  { id:'r4', rating:2, text:'Battery life is short on my unit and the motor became noisy after a week.' },
  { id:'r5', rating:1, text:'Noisy motor and flimsy build. Battery died quickly.' },
  { id:'r6', rating:3, text:'Average battery performance but cleaning is difficult and the design is confusing.' }
];

function run() {
  const heuristic = heuristicAspectSummary(sampleReviews);
  const mock = mockRewriteWithGemini(sampleReviews);
  const fallback = localFallback(sampleReviews);
  console.log('Heuristic Aspect Summary:', JSON.stringify(heuristic,null,2));
  console.log('Mock Gemini:', JSON.stringify(mock,null,2));
  console.log('Local Fallback:', JSON.stringify(fallback,null,2));
}

run();
