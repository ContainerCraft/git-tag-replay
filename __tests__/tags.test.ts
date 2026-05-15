const mockIterator = jest.fn();

jest.mock('@octokit/rest', () => {
  return {
    Octokit: {
      plugin: jest.fn().mockReturnValue(class {
        paginate = {
          iterator: mockIterator
        };
        rest = {
          repos: {
            listTags: jest.fn()
          }
        };
      })
    }
  };
});
jest.mock('@octokit/plugin-paginate-rest', () => ({
  paginateRest: jest.fn()
}));
jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn()
}));

import { fetchLocalSemverTags, fetchSemverTags, isSemverTag } from '../src/tags';
import { makeVersion, makeVersions } from "../src/versions";
import { AuthConfig, RepositoryConfig } from '../src/main';
import { Octokit } from '@octokit/rest';

describe('isSemverTag', () => {
  it.each([
    ['1.2.3', true],
    ['v1.2.3', true],
    ['0.0.0', true],
    ['10.20.30', true],
    ['1.2', false],
    ['1.2.3.4', false],
    ['1.2.3-alpha', false],
    ['1.2.3+build', false],
    ['v1.2.3-rc.1', false],
    ['release-1.2.3', false],
    ['', false],
    ['abc', false]
  ])('returns %s for %s', (input, expected) => {
    expect(isSemverTag(input as string)).toBe(expected);
  });
});

describe('fetchSemverTags', () => {
  const upstream: RepositoryConfig = {
    owner: 'octocat',
    repository: 'hello-world',
  };

  const auth: AuthConfig = {
    clientId: '12345',
    privateKey: 'key',
    installationId: '67890'
  };

  function mockOctokit(pages: Array<Array<{ name: string; sha: string }>>) {
    const iterator = {
      async* [Symbol.asyncIterator]() {
        for (const page of pages) {
          yield {
            data: page.map(t => ({name: t.name, commit: {sha: t.sha}}))
          };
        }
      }
    };
    return {
      paginate: {iterator: jest.fn().mockReturnValue(iterator)},
      rest: {repos: {listTags: jest.fn()}}
    };
  }

  it('returns only SemVer tags across paginated results', async () => {
    const octokit = mockOctokit([
      [
        {name: '1.0.0', sha: 'aaa'},
        {name: 'v2.1.3', sha: 'bbb'},
        {name: 'release-3', sha: 'ccc'}
      ],
      [
        {name: '1.2.3-alpha', sha: 'ddd'},
        {name: '4.5.6', sha: 'eee'}
      ]
    ]);
    mockIterator.mockReturnValue(octokit.paginate.iterator());

    const tags = await fetchSemverTags(upstream, auth);

    expect(tags).toEqual(makeVersions(['1.0.0', 'v2.1.3', '4.5.6']));
    expect(mockIterator).toHaveBeenCalledWith(
      expect.any(Function),
      {owner: 'octocat', repo: 'hello-world', per_page: 100}
    );
  });

  it('returns an empty array when no tags match', async () => {
    const octokit = mockOctokit([
      [
        {name: 'foo', sha: 'a'},
        {name: '1.2.3-rc.1', sha: 'b'}
      ]
    ]);
    mockIterator.mockReturnValue(octokit.paginate.iterator());

    const tags = await fetchSemverTags(upstream, auth);
    expect(tags).toEqual([]);
  });

  it('returns an empty array when the repository has no tags', async () => {
    const octokit = mockOctokit([[]]);
    mockIterator.mockReturnValue(octokit.paginate.iterator());

    const tags = await fetchSemverTags(upstream, auth);
    expect(tags).toEqual([]);
  });
});

describe('fetchLocalSemverTags', () => {
  const local: RepositoryConfig = {
    owner: 'myorg',
    repository: 'myrepo',
  };

  const auth: AuthConfig = {
    clientId: '12345',
    privateKey: 'key',
    installationId: '67890'
  };

  function mockOctokit(pages: Array<Array<{ name: string; sha: string }>>) {
    const iterator = {
      async* [Symbol.asyncIterator]() {
        for (const page of pages) {
          yield {
            data: page.map(t => ({name: t.name, commit: {sha: t.sha}}))
          };
        }
      }
    };
    return {
      paginate: {iterator: jest.fn().mockReturnValue(iterator)},
      rest: {repos: {listTags: jest.fn()}}
    };
  }

  it('fetches and filters SemVer tags from the local repository', async () => {
    const octokit = mockOctokit([
      [
        {name: '0.1.0', sha: 'xxx'},
        {name: 'foo', sha: 'zzz'},
        {name: 'v0.2.0', sha: 'yyy'}
      ]
    ]);
    mockIterator.mockReturnValue(octokit.paginate.iterator());

    const tags = await fetchLocalSemverTags(local, auth);

    expect(tags).toEqual(makeVersions(['0.1.0', 'v0.2.0']));
    expect(mockIterator).toHaveBeenCalledWith(
      expect.any(Function),
      {owner: 'myorg', repo: 'myrepo', per_page: 100}
    );
  });
});
