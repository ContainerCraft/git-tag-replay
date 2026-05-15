import * as core from '@actions/core';
import {context} from '@actions/github';
import {fetchLocalSemverTags, fetchSemverTags} from './tags';
import {calculate} from "./calculate";
import { makeVersion } from "./versions";

export interface AuthConfig {
  clientId: string;
  privateKey: string;
  installationId: string;
}

export interface RepositoryConfig {
  owner: string;
  repository: string;
}

export interface ActionConfig {
  upstream: RepositoryConfig;
  local: RepositoryConfig;
  auth: AuthConfig;
  minimumVersion?: string;
}

export function getLocalConfig(): RepositoryConfig {
  const {owner, repo: repository} = context.repo;
  if (!owner || !repository) {
    throw new Error(
      'GitHub owner and repository are required to identify the current repository.'
    );
  }
  return {owner, repository};
}

export function getUpstreamConfig(): RepositoryConfig {
  const owner = core.getInput('upstream_owner', {required: true});
  const repository = core.getInput('upstream_repository', {required: true});

  if (!owner) {
    throw new Error('Input "upstream_owner" is required');
  }
  if (!repository) {
    throw new Error('Input "upstream_repository" is required');
  }
  return {owner, repository};
}

export function getAuthConfig(): AuthConfig {
  const clientId = core.getInput('client-id');
  const privateKey = core.getInput('private-key');
  const installationId = core.getInput('installation-id');

  if (!clientId || !privateKey || !installationId) {
    throw new Error(
      'GitHub App authentication is required: "client-id", "private-key" and "installation-id" must all be provided.'
    );
  }

  return {
    clientId,
    privateKey,
    installationId
  };
}

export function getConfig(): ActionConfig {
  const minimumVersion = core.getInput('minimum_version', {required: true});

  if (!minimumVersion) {
    throw new Error('Input "minimum_version" is required');
  }

  return {upstream: getUpstreamConfig(), local: getLocalConfig(), auth: getAuthConfig(), minimumVersion: minimumVersion};
}

export async function run() {
  try {
    const config = getConfig();
    const {upstream, local, auth, minimumVersion} = config;
    core.setSecret(auth.privateKey);

    core.info(
      `Upstream repository: ${upstream.owner}/${upstream.repository}`
    );
    const tags = await fetchSemverTags(upstream, auth);
    core.info(
      `Found ${tags.length} SemVer tag(s) in ${upstream.owner}/${upstream.repository}`
    );
    for (const tag of tags) {
      core.info(`  ${tag.version}`);
    }
    core.info(
      `Local repository: ${local.owner}/${local.repository}`
    );
    const localTags = await fetchLocalSemverTags(local, auth);
    core.info(
      `Found ${localTags.length} SemVer tag(s) in ${local.owner}/${local.repository}`
    );
    for (const tag of localTags) {
      core.info(`  ${tag.version}`);
    }
    core.info(`Ref: ${process.env.GITHUB_REF_NAME || ""}`)
    core.info(`Minimum version: ${minimumVersion}`)

    const nextTag = calculate(tags, localTags, process.env.GITHUB_REF_NAME || "", makeVersion(minimumVersion||"0.0.0") );
    if (nextTag) {
      core.info(
        `Lowest missing SemVer tag: ${nextTag.version}`
      );
      core.setOutput('nextTag', nextTag.version);
    } else {
      core.info('No missing upstream SemVer tags to replay');
      core.setOutput('nextTag', '');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}
