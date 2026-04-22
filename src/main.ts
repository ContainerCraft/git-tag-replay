import * as core from '@actions/core';

export type AuthConfig =
  | {type: 'token'; token: string}
  | {
      type: 'app';
      appId: string;
      privateKey: string;
      installationId: string;
    };

export interface ActionConfig {
  owner: string;
  repository: string;
  auth: AuthConfig;
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

  return {owner, repository, auth};
}

export async function run() {
  try {
    const config = getConfig();
    core.setSecret(
      config.auth.type === 'token' ? config.auth.token : config.auth.privateKey
    );
    core.info('Git Tag Replay Action called');
    core.info(
      `Upstream repository: ${config.owner}/${config.repository} (auth: ${config.auth.type})`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}
