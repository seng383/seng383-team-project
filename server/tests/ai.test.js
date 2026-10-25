const { summarize, buildMessages, MOCK_SUMMARIES } = require('../src/ai');

describe('AI module', () => {
  const records = [{ type: 'task', title: 'Kitap oku', status: 'done' }];

  test('mock mode returns a fixed summary per role without calling the network', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    process.env.AI_MODE = 'mock';

    const parent = await summarize({ role: 'parent', records });
    const specialist = await summarize({ role: 'specialist', records });

    expect(parent).toEqual({ text: MOCK_SUMMARIES.parent, mock: true });
    expect(specialist).toEqual({ text: MOCK_SUMMARIES.specialist, mock: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('parents and specialists get different prompts', () => {
    const parent = buildMessages('parent', records)[0].content;
    const specialist = buildMessages('specialist', records)[0].content;

    expect(parent).not.toBe(specialist);
  });

  test('the prompt forbids diagnosis, treatment and decisions', () => {
    const system = buildMessages('parent', records)[0].content;

    expect(system).toMatch(/Never give a diagnosis/);
    expect(system).toMatch(/never suggest a treatment/);
    expect(system).toMatch(/never make a decision/);
  });

  test('only the given records are sent to the model', () => {
    const user = buildMessages('specialist', records)[1].content;

    expect(JSON.parse(user)).toEqual(records);
  });
});
