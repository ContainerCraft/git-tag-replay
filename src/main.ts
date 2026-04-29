import * as core from '@actions/core';
import {context} from '@actions/github';
import {compare} from 'semver';
import {fetchLocalSemverTags, fetchSemverTags} from './tags';

export type AuthConfig =
  | {type: 'token'; token: string}
  | {
      type: 'app';
      appId: string;
      privateKey: string;
      installationId: string;
    };

export interface UpstreamConfig {
  owner: string;
  repository: string;
  auth: AuthConfig;
}

export interface LocalConfig {
  owner: string;
  repository: string;
  token: string;
}

export interface ActionConfig {
  upstream: UpstreamConfig;
  local: LocalConfig;
  minimumVersion?: string;
}

export function getLocalConfig(): LocalConfig {
  const {owner, repo: repository} = context.repo;
  if (!owner || !repository) {
    throw new Error(
      'GitHub owner and repository are required to identify the current repository.'
    );
  }
  const token = core.getInput('token') || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'A GitHub token is required to read tags from the current repository.'
    );
  }
  return {owner, repository, token};
}

export function getConfig(): ActionConfig {
  const owner = core.getInput('upstream_owner', {required: true});
  const repository = core.getInput('upstream_repository', {required: true});

  if (!owner) {
    throw new Error('Input "upstream_owner" is required');
  }
  if (!repository) {
    throw new Error('Input "upstream_repository" is required');
  }

  const minimumVersion = core.getInput('minimum_version', {required: true});

  if (!minimumVersion) {
    throw new Error('Input "minimum_version" is required');
  }

  const token = core.getInput('upstream_token');
  const appId = core.getInput('upstream_app_id');
  const privateKey = core.getInput('upstream_private_key');
  const installationId = core.getInput('upstream_installation_id');

  const hasToken = token.length > 0;
  const hasAnyAppField =
    appId.length > 0 || privateKey.length > 0 || installationId.length > 0;
  const hasAllAppFields =
    appId.length > 0 && privateKey.length > 0 && installationId.length > 0;

  if (hasToken && hasAnyAppField) {
    throw new Error(
      'Authentication inputs are mutually exclusive: provide either "upstream_token" or the GitHub App inputs ("upstream_app_id", "upstream_private_key", "upstream_installation_id"), not both.'
    );
  }

  if (!hasToken && !hasAnyAppField) {
    throw new Error(
      'Authentication is required: provide either "upstream_token" or all GitHub App inputs ("upstream_app_id", "upstream_private_key", "upstream_installation_id").'
    );
  }

  if (hasAnyAppField && !hasAllAppFields) {
    throw new Error(
      'Incomplete GitHub App authentication: "upstream_app_id", "upstream_private_key" and "upstream_installation_id" must all be provided together.'
    );
  }

  const auth: AuthConfig = hasToken
    ? {type: 'token', token}
    : {
        type: 'app',
        appId,
        privateKey,
        installationId
      };

  return {upstream: {owner, repository, auth}, local: getLocalConfig(), minimumVersion: minimumVersion};
}

export async function run() {
  try {
    const config = getConfig();
    const {upstream, local} = config;
    core.setSecret(
      upstream.auth.type === 'token'
        ? upstream.auth.token
        : upstream.auth.privateKey
    );
    core.setSecret(local.token);
    core.info('Git Tag Replay Action called');
    core.info(
      `Upstream repository: ${upstream.owner}/${upstream.repository} (auth: ${upstream.auth.type})`
    );
    const tags = await fetchSemverTags(upstream);
    core.info(
      `Found ${tags.length} SemVer tag(s) in ${upstream.owner}/${upstream.repository}`
    );
    for (const tag of tags) {
      core.info(`  ${tag.name} (${tag.version}) -> ${tag.sha}`);
    }
    core.info(
      `Local repository: ${local.owner}/${local.repository}`
    );
    const localTags = await fetchLocalSemverTags(local);
    core.info(
      `Found ${localTags.length} SemVer tag(s) in ${local.owner}/${local.repository}`
    );
    for (const tag of localTags) {
      core.info(`  ${tag.name} (${tag.version}) -> ${tag.sha}`);
    }

    const localTagNames = new Set(localTags.map(tag => tag.name));
    const missingTags = tags.filter(tag => !localTagNames.has(tag.name));
    core.info(
      `Found ${missingTags.length} upstream SemVer tag(s) missing locally`
    );
    const sortedMissing = [...missingTags].sort((a, b) =>
      compare(a.version, b.version)
    );
    const nextTag = sortedMissing[0];
    if (nextTag) {
      core.info(
        `Lowest missing SemVer tag: ${nextTag.name} (${nextTag.version}) -> ${nextTag.sha}`
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
