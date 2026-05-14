import * as github from '@actions/github';
import {createAppAuth} from '@octokit/auth-app';
import {parse, SemVer} from 'semver';
import {LocalConfig, UpstreamConfig} from './main';
import {makeVersion} from "./versions";

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
): ReturnType<typeof github.getOctokit> {
  return github.getOctokit('', {
    authStrategy: createAppAuth,
    auth: {
      appId: Number(upstream.auth.appId),
      privateKey: upstream.auth.privateKey,
      installationId: Number(upstream.auth.installationId)
    }
  });
}

export function createLocalOctokit(
  local: LocalConfig
): ReturnType<typeof github.getOctokit> {
  return github.getOctokit(local.token);
}

/**
 * Fetch all tags from the upstream repository that match
 * strict MAJOR.MINOR.BUILD SemVer semantics.
 */
export async function fetchSemverTags(
  upstream: UpstreamConfig,
  octokit: ReturnType<typeof github.getOctokit> = createOctokit(upstream)
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
  octokit: ReturnType<typeof github.getOctokit> = createLocalOctokit(local)
): Promise<SemVer[]> {
  return fetchSemverTagsFromRepo(
    {owner: local.owner, repository: local.repository},
    octokit
  );
}

async function fetchSemverTagsFromRepo(
  repo: RepoRef,
  octokit: ReturnType<typeof github.getOctokit>
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
