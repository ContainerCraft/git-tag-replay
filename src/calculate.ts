import { compare, SemVer } from 'semver';

export function calculate(upstreamVersions: SemVer[], localVersions: SemVer[], branch: string, minimumVersion: SemVer): SemVer {
  // Remove the versions smaller than my required minimumVersion
  let leftOver = upstreamVersions.filter(v => v.compare(minimumVersion) >= 0);
  // Remove the versions I already have in my local Git repository
  leftOver = leftOver.filter(v =>
    localVersions.find(localVersion => compare(v, localVersion) == 0) === undefined
  );

  // Filter further based on the branch name
  if (branch.startsWith('release/')) {
    const branchVersion = branch.split('/')[1].substring(1) // Result `1` or `1.1`
    const versionParts = branchVersion.split('.').map(Number);
    leftOver = leftOver.filter(makeReleaseBranchFilter(versionParts[0], versionParts[1]));
  }

  // Sort what is left over low to high
  leftOver.sort((a, b) => a.compare(b));

  return leftOver[0]
}

function makeReleaseBranchFilter(major: number, minor?: number) : (version: SemVer) => boolean {
  function filter(version: SemVer) {
    let result = version.major === major;
    if (minor !== undefined) {
      result = result && version.minor === minor;
    }
    return result;
  }
  return filter
}