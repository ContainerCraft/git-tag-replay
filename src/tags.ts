import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { parse, SemVer } from 'semver';
import { LocalConfig, UpstreamConfig } from './main';
import { makeVersion } from "./versions";

// Custom type for Octokit with paginate plugin
export type MyOctokitInstance = Octokit & {
  paginate: {
    iterator: (method: any, options: any) => AsyncIterable<{ data: any[] }>;
  };
};

export interface RepoRef {
  owner: string;
  repository: string;
}

export function isSemverTag(name: string): boolean {
  let version: SemVer | null = parse(name);
  return version?.prerelease.length === 0 && version?.build.length === 0;
}

export function createOctokit(
  upstream: UpstreamConfig
): MyOctokitInstance {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { paginateRest } = require('@octokit/plugin-paginate-rest');
  const MyOctokit = Octokit.plugin(paginateRest);
  return new MyOctokit({
    authStrategy: createAppAuth,
    auth: {
      appId: Number(upstream.auth.clientId),
      privateKey: upstream.auth.privateKey,
      installationId: Number(upstream.auth.installationId)
    }
  }) as unknown as MyOctokitInstance;
}

export function createLocalOctokit(
  local: LocalConfig
): MyOctokitInstance {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { paginateRest } = require('@octokit/plugin-paginate-rest');
  const MyOctokit = Octokit.plugin(paginateRest);
  return new MyOctokit({
    authStrategy: createAppAuth,
    auth: {
      appId: Number(local.auth.clientId),
      privateKey: local.auth.privateKey,
      installationId: Number(local.auth.installationId)
    }
  }) as unknown as MyOctokitInstance;
}

/**
 * Fetch all tags from the upstream repository that match
 * strict MAJOR.MINOR.BUILD SemVer semantics.
 */
export async function fetchSemverTags(
  upstream: UpstreamConfig,
  octokit: MyOctokitInstance = createOctokit(upstream)
): Promise<SemVer[]> {
  return fetchSemverTagsFromRepo(
    {owner: upstream.owner, repository: upstream.repository},
    octokit
  );
}

/**
 * Fetch all tags from the local (current) repository that match
 * strict MAJOR.MINOR.BUILD SemVer semantics.
 */
export async function fetchLocalSemverTags(
  local: LocalConfig,
  octokit: MyOctokitInstance = createLocalOctokit(local)
): Promise<SemVer[]> {
  return fetchSemverTagsFromRepo(
    {owner: local.owner, repository: local.repository},
    octokit
  );
}

async function fetchSemverTagsFromRepo(
  repo: RepoRef,
  octokit: MyOctokitInstance
): Promise<SemVer[]> {
  const iterator = octokit.paginate.iterator(octokit.rest.repos.listTags, {
    owner: repo.owner,
    repo: repo.repository,
    per_page: 100
  });

  const result: SemVer[] = [];
  for await (const {data} of iterator) {
    for (const tag of data) {
      if (!isSemverTag(tag.name)) {
        continue;
      }
      const match = makeVersion(tag.name);
      if (!match) {
        continue;
      }
      result.push(match);
    }
  }
  return result;
}
