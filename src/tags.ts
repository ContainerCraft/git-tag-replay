import * as github from '@actions/github';
import {createAppAuth} from '@octokit/auth-app';
import {valid} from 'semver';
import {LocalConfig, UpstreamConfig} from './main';

export interface SemverTag {
  name: string;
  version: string;
  sha: string;
}

export interface RepoRef {
  owner: string;
  repository: string;
}

/**
 * A strict MAJOR.MINOR.BUILD (a.k.a. MAJOR.MINOR.PATCH) SemVer matcher.
 * Accepts an optional leading `v` prefix (e.g. `v1.2.3`) but rejects
 * pre-release or build metadata suffixes.
 */
const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function isSemverTag(name: string): boolean {
  const match = SEMVER_REGEX.exec(name);
  if (!match) {
    return false;
  }
  // Double-check with semver for a canonical validity signal.
  return valid(`${match[1]}.${match[2]}.${match[3]}`) !== null;
}

export function createOctokit(
  upstream: UpstreamConfig
): ReturnType<typeof github.getOctokit> {
  if (upstream.auth.type === 'token') {
    return github.getOctokit(upstream.auth.token);
  }
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
): Promise<SemverTag[]> {
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
): Promise<SemverTag[]> {
  return fetchSemverTagsFromRepo(
    {owner: local.owner, repository: local.repository},
    octokit
  );
}

async function fetchSemverTagsFromRepo(
  repo: RepoRef,
  octokit: ReturnType<typeof github.getOctokit>
): Promise<SemverTag[]> {
  const iterator = octokit.paginate.iterator(octokit.rest.repos.listTags, {
    owner: repo.owner,
    repo: repo.repository,
    per_page: 100
  });

  const result: SemverTag[] = [];
  for await (const {data} of iterator) {
    for (const tag of data) {
      if (!isSemverTag(tag.name)) {
        continue;
      }
      const match = SEMVER_REGEX.exec(tag.name);
      if (!match) {
        continue;
      }
      result.push({
        name: tag.name,
        version: `${match[1]}.${match[2]}.${match[3]}`,
        sha: tag.commit.sha
      });
    }
  }
  return result;
}
