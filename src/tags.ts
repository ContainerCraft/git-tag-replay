import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { paginateRest } from "@octokit/plugin-paginate-rest";

import { parse, SemVer } from 'semver';
import { AuthConfig, RepositoryConfig } from './main';
import { makeVersion } from "./versions";

// Custom type for Octokit with paginate plugin & REST endpoints
export type OctokitRest = Octokit & {
  paginate: {
    iterator: (method: any, options: any) => AsyncIterable<{ data: any[] }>;
  };
};

export function isSemverTag(name: string): boolean {
  let version: SemVer | null = parse(name);
  return version?.prerelease.length === 0 && version?.build.length === 0;
}

export function createOctokit(
  upstream: RepositoryConfig,
  auth: AuthConfig,
): OctokitRest {
  const MyOctokit = Octokit.plugin(paginateRest);
  return new MyOctokit({
    authStrategy: createAppAuth,
    auth: {
      appId: auth.clientId,
      privateKey: auth.privateKey,
      installationId: auth.installationId
    }
  }) as unknown as OctokitRest;
}

/**
 * Fetch all tags from the upstream repository that match
 * strict MAJOR.MINOR.BUILD SemVer semantics.
 */
export async function fetchSemverTags(
  upstream: RepositoryConfig,
  auth: AuthConfig,
): Promise<SemVer[]> {
  const octokit: OctokitRest = createOctokit(upstream, auth)
  return fetchSemverTagsFromRepo(
    upstream,
    octokit
  );
}

/**
 * Fetch all tags from the local (current) repository that match
 * strict MAJOR.MINOR.BUILD SemVer semantics.
 */
export async function fetchLocalSemverTags(
  local: RepositoryConfig,
  auth: AuthConfig,
): Promise<SemVer[]> {
  const octokit: OctokitRest = createOctokit(local, auth)
  return fetchSemverTagsFromRepo(
    local,
    octokit
  );
}

async function fetchSemverTagsFromRepo(
  repo: RepositoryConfig,
  octokit: OctokitRest
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
