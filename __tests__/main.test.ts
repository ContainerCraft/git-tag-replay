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
  'INPUT_CLIENT-ID',
  'INPUT_PRIVATE-KEY',
  'INPUT_INSTALLATION-ID',
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
    setLocalEnv({repo: null});
  });

  it('returns app-based auth when all app fields are provided', () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      'client-id': '12345',
      'private-key': '-----BEGIN KEY-----',
      'installation-id': '67890',
      minimum_version: '1.0.0',
    });

    const config = getConfig();

    expect(config.auth).toEqual({
      clientId: '12345',
      privateKey: '-----BEGIN KEY-----',
      installationId: '67890'
    });
  });

  it('throws when upstream_owner is missing', () => {
    setInputs({
      upstream_repository: 'hello-world',
      minimum_version: '1.0.0',
      'client-id': '12345',
      'private-key': 'key',
      'installation-id': '67890'
    });
    expect(() => getConfig()).toThrow(/upstream_owner/i);
  });

  it('throws when upstream_repository is missing', () => {
    setInputs({
      upstream_owner: 'octocat',
      minimum_version: '1.0.0',
      'client-id': '12345',
      'private-key': 'key',
      'installation-id': '67890'
    });
    expect(() => getConfig()).toThrow(/upstream_repository/i);
  });

  it('throws when no authentication input is provided', () => {
    setInputs({upstream_owner: 'octocat', upstream_repository: 'hello-world', minimum_version: '1.0.0'});
    expect(() => getConfig()).toThrow(/github app authentication is required/i);
  });

  it('throws when no mimimum_version input is provided', () => {
    setInputs({upstream_owner: 'octocat', upstream_repository: 'hello-world'});
    expect(() => getConfig()).toThrow(/minimum_version/i);
  });


  it('throws when GitHub App inputs are incomplete', () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      'client-id': '12345',
      'private-key': 'key',
      minimum_version: '1.0.0',
    });
    expect(() => getConfig()).toThrow(/github app authentication is required/i);
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
    setLocalEnv({repo: null});
  });

  it('masks the private key and logs app auth', async () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      'client-id': '12345',
      'private-key': 'PRIVATE',
      'installation-id': '67890',
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
      /github app authentication is required/i
    );
  });

  it('fetches SemVer tags from the upstream repository and logs them', async () => {
    (tags.fetchSemverTags as jest.Mock).mockResolvedValue(makeVersions(['1.0.0', '2.1.3',]));
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      'client-id': '12345',
      'private-key': 'PRIVATE',
      'installation-id': '67890',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).not.toHaveBeenCalled();
    expect(tags.fetchSemverTags).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'octocat',
        repository: 'hello-world',
      }),
      expect.objectContaining({
        clientId: '12345',
        privateKey: 'PRIVATE',
        installationId: '67890'
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
      'client-id': '12345',
      'private-key': 'PRIVATE',
      'installation-id': '67890',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).toHaveBeenCalledWith('API rate limit exceeded');
  });

  it('resolves without throwing when configured correctly', async () => {
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      'client-id': '12345',
      'private-key': 'PRIVATE',
      'installation-id': '67890',
      minimum_version: '1.0.0'
    });
    await expect(run()).resolves.toBeUndefined();
  });

  it('fetches SemVer tags from the local repository and logs them', async () => {
    (tags.fetchLocalSemverTags as jest.Mock).mockResolvedValue(makeVersions(['0.1.0', '0.2.0']));
    setLocalEnv({repo: 'myorg/myrepo'});
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      'client-id': '12345',
      'private-key': 'PRIVATE',
      'installation-id': '67890',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).not.toHaveBeenCalled();
    expect(tags.fetchLocalSemverTags).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'myorg',
        repository: 'myrepo',
      }),
      expect.objectContaining({
        clientId: '12345',
        privateKey: 'PRIVATE',
        installationId: '67890'
      })
    );
  });

  it('calls setFailed when GitHub owner or repository is missing', async () => {
    setLocalEnv({repo: null});
    setInputs({
      upstream_owner: 'octocat',
      upstream_repository: 'hello-world',
      'client-id': '12345',
      'private-key': 'PRIVATE',
      'installation-id': '67890',
      minimum_version: '1.0.0',
    });

    await run();

    expect(setFailedSpy).toHaveBeenCalledTimes(1);
    expect(setFailedSpy.mock.calls[0][0]).toMatch(/owner|repository/i);
  });

});

describe('getLocalConfig', () => {
  beforeEach(() => {
    setLocalEnv();
  });
  afterEach(() => {
    setLocalEnv({repo: null});
    setInputs({});
  });

  it('returns owner, repository and auth from environment and params', () => {
    setLocalEnv({repo: 'myorg/myrepo'});
    const auth = {clientId: '123', privateKey: 'pk', installationId: '456'};
    expect(getLocalConfig()).toEqual({
      owner: 'myorg',
      repository: 'myrepo',
    });
  });

  it('throws when GitHub owner or repository is missing from context', () => {
    setLocalEnv({repo: null});
    expect(() => getLocalConfig()).toThrow(/owner|repository/i);
  });
});
