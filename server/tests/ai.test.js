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

  describe('live mode', () => {
    const saved = { ...process.env };

    function answerWith(body, { ok = true, status = 200 } = {}) {
      return jest.spyOn(global, 'fetch').mockResolvedValue({ ok, status, json: async () => body });
    }

    beforeEach(() => {
      process.env.AI_MODE = 'live';
      process.env.GEMINI_API_KEY = 'test-key';
      delete process.env.AI_MODEL;
    });

    afterEach(() => {
      process.env = { ...saved };
      jest.restoreAllMocks();
    });

    test('sends the prompt to the Gemini API with the key in the header', async () => {
      const fetchSpy = answerWith({ steps: [{ type: 'model_output', content: [{ text: 'Özet' }] }] });

      await summarize({ role: 'parent', records });

      const [url, options] = fetchSpy.mock.calls[0];
      const [system, user] = buildMessages('parent', records);
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
      expect(url).not.toContain('test-key');
      expect(options.headers['x-goog-api-key']).toBe('test-key');
      expect(options.headers['Api-Revision']).toBe('2026-05-20');
      expect(JSON.parse(options.body)).toEqual({
        model: 'gemini-3.6-flash',
        system_instruction: system.content,
        input: user.content,
      });
    });

    test('uses the model from AI_MODEL when it is set', async () => {
      process.env.AI_MODEL = 'gemini-3.8-flash';
      const fetchSpy = answerWith({ steps: [{ type: 'model_output', content: [{ text: 'Özet' }] }] });

      await summarize({ role: 'parent', records });

      expect(JSON.parse(fetchSpy.mock.calls[0][1].body).model).toBe('gemini-3.8-flash');
    });

    test('reads the answer from the model_output step and skips the other steps', async () => {
      answerWith({
        steps: [
          { type: 'thought', summary: 'düşünce' },
          { type: 'model_output', content: [{ text: 'Bu hafta ' }, { text: 'iyi geçti.' }] },
        ],
      });

      const result = await summarize({ role: 'parent', records });

      expect(result).toEqual({ text: 'Bu hafta iyi geçti.', mock: false });
    });

    test('throws when the provider answers with an error', async () => {
      answerWith({}, { ok: false, status: 429 });

      await expect(summarize({ role: 'parent', records })).rejects.toThrow('AI provider returned 429');
    });

    test.each([
      ['no steps', {}],
      ['no model_output step', { steps: [{ type: 'thought' }] }],
      ['an empty answer', { steps: [{ type: 'model_output', content: [] }] }],
    ])('throws when the response has %s', async (_name, body) => {
      answerWith(body);

      await expect(summarize({ role: 'parent', records })).rejects.toThrow('AI provider returned no text');
    });
  });
});
