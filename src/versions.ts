import { SemVer } from "semver";

export function makeVersion(version: string): SemVer {
  return new SemVer(version, {loose: false, includePrerelease: false});
}

export function makeVersions(versions: string[]): SemVer[] {
  return versions.map(v => makeVersion(v));
}
