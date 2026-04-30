import * as core from '@actions/core';
import { context } from '@actions/github';
import { getConfig, getLocalConfig, run } from '../src/main';
import * as tags from '../src/tags';
import { makeVersions } from "../src/versions";

jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'local-owner',
      repo: 'local-repo'
    }
  }
}));

jest.mock('../src/tags', () => ({
  fetchSemverTags: jest.fn(),
  fetchLocalSemverTags: jest.fn(),
  isSemverTag: jest.fn(),
  createOctokit: jest.fn(),
  createLocalOctokit: jest.fn()
}));

const INPUT_KEYS = [
  'INPUT_UPSTREAM_OWNER',
  'INPUT_UPSTREAM_REPOSITORY',
  'INPUT_UPSTREAM_TOKEN',
  'INPUT_UPSTREAM_APP_ID',
  'INPUT_UPSTREAM_PRIVATE_KEY',
  'INPUT_UPSTREAM_INSTALLATION_ID',
  'INPUT_MINIMUM_VERSION'
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

function setLocalEnv(
  env: {
    repo?: string | null;
    token?: string | null;
    ref?: string;
  } = {}
): void {
  if (env.repo === null) {
    (context as any).repo = {owner: undefined, repo: undefined};
  } else if (env.repo) {
    const [owner, repo] = env.repo.split('/');
    (context as any).repo = {owner, repo};
  } else {
    (context as any).repo = {owner: 'local-owner', repo: 'local-repo'};
  }
  if (env.token === null) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = env.token ?? 'local-token';
  }
  if (env.ref) {
    process.env.GITHUB_REF = env.ref;
    (context as any).ref = env.ref;
  }
}

describe('getConfig', () => {
  beforeEach(() => {
    setLocalEnv();
  });
  afterEach(() => {
    setInputs({});
    setLocalEnv({repo: null, token: null});
  });

  it('returns token-based auth when only token is provided', () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret',
      minimum_version: '1.0.0',
    });

    const config = getConfig();

    expect(config.upstream.owner).toBe('octocat');
    expect(config.upstream.repository).toBe('hello-world');
    expect(config.upstream.auth).toEqual({type: 'token', token: 'ghp_secret'});
  });

  it('returns app-based auth when all app fields are provided', () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_app_id: '12345',
      upstream_private_key: '-----BEGIN KEY-----',
      upstream_installation_id: '67890',
      minimum_version: '1.0.0',
    });

    const config = getConfig();

    expect(config.upstream.auth).toEqual({
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
    setInputs({upstream_owner: 'octocat', upstream_repository: 'hello-world', minimum_version: '1.0.0'});
    expect(() => getConfig()).toThrow(/authentication is required/i);
  });

  it('throws when no mimimum_version input is provided', () => {
    setInputs({upstream_owner: 'octocat', upstream_repository: 'hello-world'});
    expect(() => getConfig()).toThrow(/minimum_version/i);
  });

  it('throws when both token and app credentials are provided', () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret',
      upstream_app_id: '12345',
      upstream_private_key: 'key',
      upstream_installation_id: '67890',
      minimum_version: '1.0.0',
    });
    expect(() => getConfig()).toThrow(/mutually exclusive/i);
  });

  it('throws when GitHub App inputs are incomplete', () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_app_id: '12345',
      upstream_private_key: 'key',
      minimum_version: '1.0.0',
    });
    expect(() => getConfig()).toThrow(/incomplete github app/i);
  });
});

describe('run', () => {
  let setFailedSpy: jest.SpyInstance;
  let setSecretSpy: jest.SpyInstance;

  beforeEach(() => {
    setLocalEnv({ref: 'main'});
    setFailedSpy = jest.spyOn(core, 'setFailed').mockImplementation(() => {
    });
    setSecretSpy = jest.spyOn(core, 'setSecret').mockImplementation(() => {
    });
    jest.spyOn(core, 'setOutput').mockImplementation(() => {
    });
    (tags.fetchSemverTags as jest.Mock).mockReset();
    (tags.fetchSemverTags as jest.Mock).mockResolvedValue(makeVersions(['1.0.0']));
    (tags.fetchLocalSemverTags as jest.Mock).mockReset();
    (tags.fetchLocalSemverTags as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setInputs({});
    setLocalEnv({repo: null, token: null});
  });

  it('logs the expected info message with token auth', async () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).not.toHaveBeenCalled();
    expect(setSecretSpy).toHaveBeenCalledWith('ghp_secret');
  });

  it('masks the private key and logs app auth', async () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_app_id: '12345',
      upstream_private_key: 'PRIVATE',
      upstream_installation_id: '67890',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).not.toHaveBeenCalled();
    expect(setSecretSpy).toHaveBeenCalledWith('PRIVATE');
  });

  it('calls setFailed when configuration is invalid', async () => {
    setInputs({upstream_owner: 'octocat', upstream_repository: 'hello-world', minimum_version: '1.0.0'});

    await run();

    expect(setFailedSpy).toHaveBeenCalledTimes(1);
    expect(setFailedSpy.mock.calls[0][0]).toMatch(
      /authentication is required/i
    );
  });

  it('fetches SemVer tags from the upstream repository and logs them', async () => {
    (tags.fetchSemverTags as jest.Mock).mockResolvedValue(makeVersions(['1.0.0', '2.1.3',]));
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).not.toHaveBeenCalled();
    expect(tags.fetchSemverTags).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'octocat',
        repository: 'hello-world',
        auth: {type: 'token', token: 'ghp_secret'}
      })
    );
  });

  it('calls setFailed when tag fetching fails', async () => {
    (tags.fetchSemverTags as jest.Mock).mockRejectedValue(
      new Error('API rate limit exceeded')
    );
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).toHaveBeenCalledWith('API rate limit exceeded');
  });

  it('resolves without throwing when configured correctly', async () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret'
    });
    await expect(run()).resolves.toBeUndefined();
  });

  it('fetches SemVer tags from the local repository and logs them', async () => {
    (tags.fetchLocalSemverTags as jest.Mock).mockResolvedValue(makeVersions(['0.1.0', '0.2.0']));
    setLocalEnv({repo: 'myorg/myrepo', token: 'local-secret'});
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).not.toHaveBeenCalled();
    expect(setSecretSpy).toHaveBeenCalledWith('local-secret');
    expect(tags.fetchLocalSemverTags).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'myorg',
        repository: 'myrepo',
        token: 'local-secret'
      })
    );
  });

  it('calls setFailed when GitHub owner or repository is missing', async () => {
    setLocalEnv({repo: null, token: 'local-secret'});
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).toHaveBeenCalledTimes(1);
    expect(setFailedSpy.mock.calls[0][0]).toMatch(/owner|repository/i);
  });

  it('calls setFailed when GITHUB_TOKEN is missing', async () => {
    setLocalEnv({repo: 'myorg/myrepo', token: null});
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      upstream_token: 'ghp_secret',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).toHaveBeenCalledTimes(1);
    expect(setFailedSpy.mock.calls[0][0]).toMatch(/GitHub token is required/i);
  });
});

describe('getLocalConfig', () => {
  beforeEach(() => {
    setLocalEnv();
  });
  afterEach(() => {
    setLocalEnv({repo: null, token: null});
    setInputs({});
  });

  it('returns owner, repository and token from environment', () => {
    setLocalEnv({repo: 'myorg/myrepo', token: 'local-secret'});
    expect(getLocalConfig()).toEqual({
      owner: 'myorg',
      repository: 'myrepo',
      token: 'local-secret'
    });
  });

  it('throws when GitHub owner or repository is missing from context', () => {
    setLocalEnv({repo: null, token: 'local-secret'});
    expect(() => getLocalConfig()).toThrow(/owner|repository/i);
  });

  it('throws when no GitHub token is available', () => {
    setLocalEnv({repo: 'myorg/myrepo', token: null});
    expect(() => getLocalConfig()).toThrow(/GitHub token is required/i);
  });
});
