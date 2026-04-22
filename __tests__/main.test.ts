import * as core from '@actions/core';
import {getConfig, run} from '../src/main';

const INPUT_KEYS = [
  'INPUT_UPSTREAM_OWNER',
  'INPUT_UPSTREAM_REPOSITORY',
  'INPUT_UPSTREAM_TOKEN',
  'INPUT_UPSTREAM_APP_ID',
  'INPUT_UPSTREAM_PRIVATE_KEY',
  'INPUT_UPSTREAM_INSTALLATION_ID'
];

function setInputs(inputs: Record<string, string | undefined>): void {
  for (const key of INPUT_KEYS) {
    delete process.env[key];
  }
  for (const [name, value] of Object.entries(inputs)) {
    if (value !== undefined) {
      process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] = value;
    }
  }
}

describe('getConfig', () => {
  afterEach(() => {
    setInputs({});
  });

  it('returns token-based auth when only token is provided', () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret'
    });

    const config = getConfig();

    expect(config.owner).toBe('octocat');
    expect(config.repository).toBe('hello-world');
    expect(config.auth).toEqual({type: 'token', token: 'ghp_secret'});
  });

  it('returns app-based auth when all app fields are provided', () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_app_id: '12345',
      upstream_private_key: '-----BEGIN KEY-----',
      upstream_installation_id: '67890'
    });

    const config = getConfig();

    expect(config.auth).toEqual({
      type: 'app',
      appId: '12345',
      privateKey: '-----BEGIN KEY-----',
      installationId: '67890'
    });
  });

  it('throws when upstream_owner is missing', () => {
    setInputs({upstream_repository: 'hello-world', upstream_token: 'ghp_secret'});
    expect(() => getConfig()).toThrow(/upstream_owner/i);
  });

  it('throws when upstream_repository is missing', () => {
    setInputs({upstream_owner: 'octocat', upstream_token: 'ghp_secret'});
    expect(() => getConfig()).toThrow(/upstream_repository/i);
  });

  it('throws when no authentication input is provided', () => {
    setInputs({upstream_owner: 'octocat', upstream_repository: 'hello-world'});
    expect(() => getConfig()).toThrow(/authentication is required/i);
  });

  it('throws when both token and app credentials are provided', () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret',
      upstream_app_id: '12345',
      upstream_private_key: 'key',
      upstream_installation_id: '67890'
    });
    expect(() => getConfig()).toThrow(/mutually exclusive/i);
  });

  it('throws when GitHub App inputs are incomplete', () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_app_id: '12345',
      upstream_private_key: 'key'
    });
    expect(() => getConfig()).toThrow(/incomplete github app/i);
  });
});

describe('run', () => {
  let infoSpy: jest.SpyInstance;
  let setFailedSpy: jest.SpyInstance;
  let setSecretSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(core, 'info').mockImplementation(() => {});
    setFailedSpy = jest.spyOn(core, 'setFailed').mockImplementation(() => {});
    setSecretSpy = jest.spyOn(core, 'setSecret').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setInputs({});
  });

  it('logs the expected info message with token auth', async () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret'
    });

    await run();

    expect(setFailedSpy).not.toHaveBeenCalled();
    expect(setSecretSpy).toHaveBeenCalledWith('ghp_secret');
    expect(infoSpy).toHaveBeenCalledWith('Git Tag Replay Action called');
    expect(infoSpy).toHaveBeenCalledWith(
      'Upstream repository: octocat/hello-world (auth: token)'
    );
  });

  it('masks the private key and logs app auth', async () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_app_id: '12345',
      upstream_private_key: 'PRIVATE',
      upstream_installation_id: '67890'
    });

    await run();

    expect(setFailedSpy).not.toHaveBeenCalled();
    expect(setSecretSpy).toHaveBeenCalledWith('PRIVATE');
    expect(infoSpy).toHaveBeenCalledWith(
      'Upstream repository: octocat/hello-world (auth: app)'
    );
  });

  it('calls setFailed when configuration is invalid', async () => {
    setInputs({upstream_owner: 'octocat', upstream_repository: 'hello-world'});

    await run();

    expect(setFailedSpy).toHaveBeenCalledTimes(1);
    expect(setFailedSpy.mock.calls[0][0]).toMatch(
      /authentication is required/i
    );
  });

  it('resolves without throwing when configured correctly', async () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret'
    });
    await expect(run()).resolves.toBeUndefined();
  });
});
