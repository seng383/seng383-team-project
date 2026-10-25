// The only place in the code that talks to the AI provider (GitHub Models).
// AI_MODE=mock (default) returns a fixed text and never calls the network, so tests and CI need no token.

const ENDPOINT = 'https://models.github.ai/inference/chat/completions';

const MOCK_SUMMARY =
  'Bu hafta 3 görevden 2\'si tamamlandı. Uzman notlarında okuma çalışmalarına düzenli katılım görülüyor. ' +
  'Bu bir yapay zekâ önerisidir; karar size aittir.';

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
    return { text: MOCK_SUMMARY, mock: true };
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'openai/gpt-4o-mini',
      messages: buildMessages(role, records),
    }),
  });
  if (!res.ok) {
    throw new Error(`AI provider returned ${res.status}`);
  }
  const data = await res.json();
  return { text: data.choices[0].message.content, mock: false };
}

module.exports = { summarize, buildMessages, MOCK_SUMMARY };
