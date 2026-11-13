const { openDatabase } = require('../src/db');

// Each test loads the module again, because the generated secret is kept in the module.
function freshLoadJwtSecret() {
  let loadJwtSecret;
  jest.isolateModules(() => {
    ({ loadJwtSecret } = require('../src/middleware/auth'));
  });
  return loadJwtSecret;
}

describe('JWT secret', () => {
  const originalEnv = process.env.NODE_ENV;
  let warn;

  beforeEach(() => {
    delete process.env.JWT_SECRET;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = originalEnv;
    warn.mockRestore();
  });

  test('comes from JWT_SECRET when it is set', () => {
    process.env.JWT_SECRET = 'from-env';

    expect(freshLoadJwtSecret()()).toBe('from-env');
    expect(warn).not.toHaveBeenCalled();
  });

  test('is a random value with one warning when it is missing outside production', () => {
    const loadJwtSecret = freshLoadJwtSecret();

    const first = loadJwtSecret();
    const second = loadJwtSecret();

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(freshLoadJwtSecret()()).not.toBe(first);
  });

  test('counts an empty value from .env.example as missing', () => {
    process.env.JWT_SECRET = '';

    expect(freshLoadJwtSecret()()).toMatch(/^[0-9a-f]{64}$/);
  });

  test('stops the server from starting in production when it is missing', () => {
    process.env.NODE_ENV = 'production';
    const db = openDatabase(':memory:');
    const { createApp } = require('../src/app');

    expect(() => createApp(db)).toThrow('JWT_SECRET');
    db.close();
  });

  test('is accepted in production when it is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'from-env';
    const db = openDatabase(':memory:');
    const { createApp } = require('../src/app');

    expect(() => createApp(db)).not.toThrow();
    db.close();
  });
});
