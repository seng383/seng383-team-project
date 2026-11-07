// The only place in the code that talks to the AI provider (Gemini API).
// AI_MODE=mock (default) returns a fixed text per reader role and never calls the network,
// so tests and CI need no key.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';

const MOCK_SUMMARIES = {
  parent: 'Bu hafta 3 görevden 2\'si tamamlandı ve 2 etkinlik planlandı. Okuma görevi henüz bitmedi.',
  specialist: 'Bu hafta dil alanında 2 görev tamamlandı. Son gözlem notunda okuma çalışmalarına düzenli katılım yazıyor.',
};

const RULES =
  'You summarize a child\'s weekly records for the reader. Write in Turkish, at most 5 sentences. ' +
  'Use only the records you are given. Never give a diagnosis, never suggest a treatment and never make a decision for the reader.';

function buildMessages(role, records) {
  const reader = role === 'specialist'
    ? 'The reader is a specialist working with the child. Focus on observations and progress in each development area.'
    : 'The reader is the child\'s parent. Use plain language and focus on the week\'s tasks and events.';
  return [
    { role: 'system', content: `${RULES} ${reader}` },
    { role: 'user', content: JSON.stringify(records) },
  ];
}

async function summarize({ role, records }) {
  if ((process.env.AI_MODE || 'mock') === 'mock') {
    return { text: MOCK_SUMMARIES[role === 'specialist' ? 'specialist' : 'parent'], mock: true };
  }

  const [system, user] = buildMessages(role, records);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'x-goog-api-key': process.env.GEMINI_API_KEY,
      'Api-Revision': API_REVISION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gemini-3.6-flash',
      system_instruction: system.content,
      input: user.content,
    }),
  });
  if (!res.ok) {
    throw new Error(`AI provider returned ${res.status}`);
  }
  const data = await res.json();
  return { text: outputText(data), mock: false };
}

// The answer is in the model_output step; the response can also hold other steps, such as a thought step.
function outputText(data) {
  const step = (data.steps || []).findLast((s) => s.type === 'model_output');
  const text = (step?.content || []).map((block) => block.text || '').join('');
  if (!text) {
    throw new Error('AI provider returned no text');
  }
  return text;
}

module.exports = { summarize, buildMessages, MOCK_SUMMARIES };
