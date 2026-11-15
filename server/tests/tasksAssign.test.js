const request = require('supertest');
const { openDatabase } = require('../src/db');
const { seed, DEMO_PASSWORD } = require('../src/db/seed');
const { createApp } = require('../src/app');

const DESCRIPTION_ERROR = 'description must be text of at most 2000 characters';
const AREA_ERROR = 'developmentArea must be one of language, motor_skills, social_emotional, cognitive, self_care';
const DATE_ERROR = 'dueDate must be a real date as YYYY-MM-DD';

describe('POST /api/tasks', () => {
  let db;
  let app;
  let childId;
  // The task of the task form mockup, for the seeded child.
  const newWords = () => ({
    childId,
    title: '5 yeni kelimeyi cümle içinde kullan',
    description: 'Öğrendiğin kelimelerle ailene beş kısa cümle kur.',
    developmentArea: 'language',
    dueDate: '2026-11-04',
  });

  beforeEach(() => {
    db = openDatabase(':memory:');
    seed(db);
    app = createApp(db);
    childId = idOf('child@demo.test');
  });

  afterEach(() => db.close());

  function idOf(email) {
    return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  }

  async function logIn(email) {
    const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
    return res.body.token;
  }

  async function as(email) {
    const token = await logIn(email);
    const send = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
    return {
      get: (url) => send('get', url),
      assign: (body) => send('post', '/api/tasks').send(body),
      delete: (url) => send('delete', url),
    };
  }

  function taskCount() {
    return db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;
  }

  function storedTask(id) {
    return db
      .prepare('SELECT child_id, assigned_by, title, description, development_area, due_date, status, completed_at FROM tasks WHERE id = ?')
      .get(id);
  }

  // A second family, so cross-family access can be tried.
  function addOtherFamily() {
    const { password_hash: hash } = db.prepare("SELECT password_hash FROM users WHERE email = 'parent@demo.test'").get();
    const insert = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const otherParentId = insert.run('Selin Yıldız', 'other-parent@demo.test', hash, 'parent').lastInsertRowid;
    const otherChildId = insert.run('Ela Yıldız', 'other-child@demo.test', hash, 'child').lastInsertRowid;
    db.prepare('INSERT INTO children (user_id, parent_id) VALUES (?, ?)').run(otherChildId, otherParentId);
    return Number(otherChildId);
  }

  describe('assigning (FR-M4-01)', () => {
    test('lets the parent assign a task that starts as not done and answers 201 with it', async () => {
      const parentId = idOf('parent@demo.test');

      const res = await (await as('parent@demo.test')).assign(newWords());

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        childId,
        title: '5 yeni kelimeyi cümle içinde kullan',
        description: 'Öğrendiğin kelimelerle ailene beş kısa cümle kur.',
        developmentArea: 'language',
        dueDate: '2026-11-04',
        status: 'not_done',
        completedAt: null,
        assignedBy: parentId,
        assignedByName: 'Ayşe Demir',
      });
      expect(storedTask(res.body.id)).toEqual({
        child_id: childId,
        assigned_by: parentId,
        title: '5 yeni kelimeyi cümle içinde kullan',
        description: 'Öğrendiğin kelimelerle ailene beş kısa cümle kur.',
        development_area: 'language',
        due_date: '2026-11-04',
        status: 'not_done',
        completed_at: null,
      });
    });

    test.each([
      ['teacher@demo.test', 'Elif Kaya'],
      ['psychologist@demo.test', 'Murat Şahin'],
    ])('lets the linked specialist %s assign a task', async (email, name) => {
      const res = await (await as(email)).assign(newWords());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ childId, status: 'not_done', assignedBy: idOf(email), assignedByName: name });
    });

    test.each(['language', 'motor_skills', 'social_emotional', 'cognitive', 'self_care'])(
      'accepts the development area %s',
      async (developmentArea) => {
        const res = await (await as('parent@demo.test')).assign({ ...newWords(), developmentArea });

        expect(res.status).toBe(201);
        expect(storedTask(res.body.id).development_area).toBe(developmentArea);
      }
    );

    test('accepts the childId as digits-only text', async () => {
      const res = await (await as('parent@demo.test')).assign({ ...newWords(), childId: String(childId) });

      expect(res.status).toBe(201);
      expect(res.body.childId).toBe(childId);
    });

    test('stores the title and the description without the spaces around them', async () => {
      const res = await (await as('parent@demo.test')).assign({ ...newWords(), title: '  Kitap oku  ', description: '\n Bir bölüm oku. \n' });

      expect(res.body).toMatchObject({ title: 'Kitap oku', description: 'Bir bölüm oku.' });
      expect(storedTask(res.body.id)).toMatchObject({ title: 'Kitap oku', description: 'Bir bölüm oku.' });
    });

    test.each([
      ['no description', undefined],
      ['a null description', null],
      ['an empty description', ''],
      ['a description of spaces only', ' \n '],
    ])('stores %s as no description', async (_, description) => {
      const res = await (await as('parent@demo.test')).assign({ ...newWords(), description });

      expect(res.status).toBe(201);
      expect(res.body.description).toBeNull();
      expect(storedTask(res.body.id).description).toBeNull();
    });

    test.each([
      ['a title of 200 characters', { title: 'a'.repeat(200) }],
      ['a title of 200 characters with spaces around it', { title: `  ${'a'.repeat(200)}  ` }],
      ['a description of 2000 characters', { description: 'a'.repeat(2000) }],
      ['a description of 2000 characters with spaces around it', { description: `  ${'a'.repeat(2000)}  ` }],
      ['29 February of a leap year', { dueDate: '2028-02-29' }],
    ])('accepts %s', async (_, change) => {
      const res = await (await as('parent@demo.test')).assign({ ...newWords(), ...change });

      expect(res.status).toBe(201);
    });

    test('starts every task as not done and takes the assigner from the token, whatever the body says', async () => {
      const parentId = idOf('parent@demo.test');
      const teacherId = idOf('teacher@demo.test');
      const body = {
        ...newWords(),
        id: 777,
        status: 'done',
        completedAt: '2026-11-01 10:00:00',
        completed_at: '2026-11-01 10:00:00',
        assignedBy: parentId,
        assigned_by: parentId,
        assignedByName: 'Ayşe Demir',
      };

      const res = await (await as('teacher@demo.test')).assign(body);

      expect(res.status).toBe(201);
      expect(res.body.id).not.toBe(777);
      expect(res.body).toMatchObject({ status: 'not_done', completedAt: null, assignedBy: teacherId, assignedByName: 'Elif Kaya' });
      expect(storedTask(res.body.id)).toMatchObject({ status: 'not_done', completed_at: null, assigned_by: teacherId });
      expect(storedTask(777)).toBeUndefined();
    });

    test('shows the new task, as it was answered, to the child and in the list of the parent', async () => {
      const added = await (await as('teacher@demo.test')).assign(newWords());

      const child = await (await as('child@demo.test')).get('/api/tasks');
      const parent = await (await as('parent@demo.test')).get(`/api/tasks?childId=${childId}`);

      expect(child.body).toContainEqual(added.body);
      expect(parent.body).toContainEqual(added.body);
    });
  });

  describe('checks (FR-M4-02)', () => {
    test.each([
      ['no title', { title: undefined }, 'title is required'],
      ['a null title', { title: null }, 'title is required'],
      ['an empty title', { title: '' }, 'title is required'],
      ['a title of spaces only', { title: '   ' }, 'title is required'],
      ['a title that is not text', { title: 42 }, 'title is required'],
      ['a title in a list', { title: ['Kitap oku'] }, 'title is required'],
      ['a title of 201 characters', { title: 'a'.repeat(201) }, 'title must be at most 200 characters'],
      ['a description that is not text', { description: 42 }, DESCRIPTION_ERROR],
      ['a description that is true', { description: true }, DESCRIPTION_ERROR],
      ['a description in a list', { description: ['Kısa cümleler kur.'] }, DESCRIPTION_ERROR],
      ['a description in an object', { description: { text: 'Kısa cümleler kur.' } }, DESCRIPTION_ERROR],
      ['a description of 2001 characters', { description: 'a'.repeat(2001) }, DESCRIPTION_ERROR],
      ['no development area', { developmentArea: undefined }, AREA_ERROR],
      ['a null development area', { developmentArea: null }, AREA_ERROR],
      ['an empty development area', { developmentArea: '' }, AREA_ERROR],
      ['the Turkish label of an area', { developmentArea: 'Dil' }, AREA_ERROR],
      ['an area in capitals', { developmentArea: 'Language' }, AREA_ERROR],
      ['an area with a space', { developmentArea: 'motor skills' }, AREA_ERROR],
      ['an area that does not exist', { developmentArea: 'music' }, AREA_ERROR],
      ['an area in a list', { developmentArea: ['language'] }, AREA_ERROR],
      ['no due date', { dueDate: undefined }, DATE_ERROR],
      ['a null due date', { dueDate: null }, DATE_ERROR],
      ['an empty due date', { dueDate: '' }, DATE_ERROR],
      ['30 February', { dueDate: '2026-02-30' }, DATE_ERROR],
      ['29 February of a year that is not a leap year', { dueDate: '2026-02-29' }, DATE_ERROR],
      ['month 13', { dueDate: '2026-13-01' }, DATE_ERROR],
      ['day 0', { dueDate: '2026-11-00' }, DATE_ERROR],
      ['the Turkish date format', { dueDate: '04.11.2026' }, DATE_ERROR],
      ['a date without leading zeros', { dueDate: '2026-11-4' }, DATE_ERROR],
      ['a date with a time', { dueDate: '2026-11-04T10:00' }, DATE_ERROR],
      ['a date that is not text', { dueDate: 20261104 }, DATE_ERROR],
      ['a date in a list', { dueDate: ['2026-11-04'] }, DATE_ERROR],
    ])('rejects %s with 400 and stores nothing', async (_, change, error) => {
      const before = taskCount();

      const res = await (await as('parent@demo.test')).assign({ ...newWords(), ...change });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error });
      expect(taskCount()).toBe(before);
    });

    test('names the first rule a task breaks when it breaks several', async () => {
      const res = await (await as('parent@demo.test')).assign({ childId });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'title is required' });
    });

    test.each([
      ['no childId', undefined],
      ['a null childId', null],
      ['an empty childId', ''],
    ])('answers 400 for %s and stores nothing', async (_, id) => {
      const before = taskCount();

      const res = await (await as('parent@demo.test')).assign({ ...newWords(), childId: id });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'childId is required' });
      expect(taskCount()).toBe(before);
    });

    test('answers a request without a body with 400 and stores nothing', async () => {
      const before = taskCount();
      const token = await logIn('parent@demo.test');

      const res = await request(app).post('/api/tasks').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'childId is required' });
      expect(taskCount()).toBe(before);
    });

    // The child is named in the body, so a body that cannot be read names no child and gets the 400 of a bad body.
    test.each(['parent@demo.test', 'coach@demo.test'])('answers a malformed body of %s with a JSON 400 and stores nothing', async (email) => {
      const before = taskCount();

      const res = await (await as(email)).assign('{"childId": ').set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Bad request' });
      expect(taskCount()).toBe(before);
    });
  });

  describe('access', () => {
    test('needs a valid token that was not logged out, also when the body is malformed (FR-M1-05)', async () => {
      const before = taskCount();
      const token = await logIn('parent@demo.test');
      await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);

      const responses = [
        await request(app).post('/api/tasks').send(newWords()),
        await request(app).post('/api/tasks').set('Content-Type', 'application/json').send('{"childId": '),
        await request(app).post('/api/tasks').set('Authorization', 'Bearer junk').send(newWords()),
        await request(app).post('/api/tasks').set('Authorization', `Bearer ${token}`).send(newWords()),
      ];

      for (const res of responses) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Unauthorized' });
      }
      expect(taskCount()).toBe(before);
    });

    test('answers 403 to the child, also for their own id and before it reads the body (FR-M1-04)', async () => {
      const before = taskCount();
      const child = await as('child@demo.test');

      const own = await child.assign(newWords());
      const malformed = await child.assign('{"childId": ').set('Content-Type', 'application/json');

      for (const res of [own, malformed]) {
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Forbidden' });
      }
      expect(taskCount()).toBe(before);
    });

    test('answers 403 without data to the unlinked coach, whose token is valid, before it checks the fields (FR-M2-05)', async () => {
      const before = taskCount();
      const coach = await as('coach@demo.test');
      expect((await coach.get('/api/auth/me')).status).toBe(200);

      const valid = await coach.assign(newWords());
      const invalid = await coach.assign({ childId, title: '' });

      for (const res of [valid, invalid]) {
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Forbidden' });
      }
      expect(taskCount()).toBe(before);
    });

    test('answers 403 to the parent of another family, also when the fields are wrong, and stores nothing', async () => {
      addOtherFamily();
      const before = taskCount();
      const otherParent = await as('other-parent@demo.test');

      const valid = await otherParent.assign(newWords());
      const invalid = await otherParent.assign({ ...newWords(), dueDate: 'junk' });

      for (const res of [valid, invalid]) {
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Forbidden' });
      }
      expect(taskCount()).toBe(before);
    });

    test('answers 403 to a linked specialist for a child they are not linked to', async () => {
      const otherChildId = addOtherFamily();

      const res = await (await as('teacher@demo.test')).assign({ ...newWords(), childId: otherChildId });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
      expect(db.prepare('SELECT * FROM tasks WHERE child_id = ?').all(otherChildId)).toEqual([]);
    });

    test.each([
      ['a fraction next to the id', (id) => id + 0.5],
      ['the id with a leading zero', (id) => `0${id}`],
      ['the id with .0', (id) => `${id}.0`],
      ['the id in e notation', (id) => `${id}e0`],
      ['the id with a plus sign', (id) => `+${id}`],
      ['the id with spaces around it', (id) => ` ${id} `],
      ['the id in a list', (id) => [id]],
      ['the id in an object', (id) => ({ id })],
      ['-1', () => -1],
      ['0', () => 0],
      ['true', () => true],
      ['false', () => false],
      ['a word', () => 'abc'],
      ['an id that belongs to no one', () => 999999],
      ['a number past the precision of an id', () => 1e20],
      ['a number too large for an id', () => 1e21],
      ['the id of the parent, who is not a child', () => idOf('parent@demo.test')],
    ])('answers 403 for %s like a child without access and stores nothing', async (_, spell) => {
      const before = taskCount();

      const res = await (await as('parent@demo.test')).assign({ ...newWords(), childId: spell(childId) });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
      expect(taskCount()).toBe(before);
    });

    test('stops a specialist with the same token as soon as the parent unlinks them (FR-M2-05)', async () => {
      const teacher = await as('teacher@demo.test');
      expect((await teacher.assign(newWords())).status).toBe(201);

      await (await as('parent@demo.test')).delete(`/api/children/${childId}/specialists/${idOf('teacher@demo.test')}`).expect(204);

      const before = taskCount();
      const res = await teacher.assign(newWords());
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
      expect(taskCount()).toBe(before);
    });
  });
});
