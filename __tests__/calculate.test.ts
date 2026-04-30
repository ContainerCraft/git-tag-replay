import { calculate } from '../src/calculate';
import { parse, SemVer } from "semver";
import { makeVersion, makeVersions } from '../src/versions';

const upstreamVersions: SemVer[] = makeVersions([
  "0.1.0",
  "0.2.0",
  "0.3.0",
  "0.4.0",
  "0.5.0",
  "1.0.0",
  "1.0.1",
  "1.0.2",
  "1.1.0",
  "1.1.1",
  "1.1.2",
  "1.2.0",
  "1.2.1",
  "1.3.0",
  "2.0.0",
  "2.0.1",
  "2.1.0",
]);

describe('calculate - branch main', () => {

  it('return same minimum', () => {
    const localVersions = [];
    const minimumVersion = makeVersion("1.0.0");

    let result = calculate(upstreamVersions, localVersions, 'main', minimumVersion)
    expect(result.compare(makeVersion("1.0.0"))).toEqual(0)
  });

  it('next lowest - next major', () => {
    const localVersions = makeVersions(["1.0.0",
      "1.0.1",
      "1.0.2",
      "1.1.0",
      "1.1.1",
      "1.1.2",
      "1.2.0",
      "1.2.1",
      "1.3.0",
    ]);
    const minimumVersion = makeVersion("1.3.0");

    let result = calculate(upstreamVersions, localVersions, 'main', minimumVersion)
    expect(result.compare(makeVersion("2.0.0"))).toEqual(0)
  });

  it('next lowest - next minor', () => {
    const localVersions = makeVersions(["1.0.0", "1.0.1", "1.0.2"]);
    const minimumVersion = makeVersion("1.0.2");

    let result = calculate(upstreamVersions, localVersions, 'main', minimumVersion)
    expect(result.compare(new SemVer("1.1.0"))).toEqual(0)
  });

  it('next lowest - next build', () => {
    const localVersions = makeVersions(["1.0.0", "1.0.1"]);
    const minimumVersion = makeVersion("1.0.1");

    let result = calculate(upstreamVersions, localVersions, 'main', minimumVersion)
    expect(result.compare(new SemVer("1.0.2"))).toEqual(0)
  });

});

describe('calculate - branch release/v1', () => {

  it('return same minimum', () => {
    const localVersions = makeVersions(["1.0.0"]);
    const minimumVersion = makeVersion("1.0.1");

    let result = calculate(upstreamVersions, localVersions, 'release/v1', minimumVersion)
    expect(result.compare(makeVersion("1.0.1"))).toEqual(0)
  });

  it('next lowest - no next major', () => {
    const localVersions = makeVersions(["1.0.0",
      "1.0.1",
      "1.0.2",
      "1.1.0",
      "1.1.1",
      "1.1.2",
      "1.2.0",
      "1.2.1",
      "1.3.0",]);
    const minimumVersion = makeVersion("1.3.0");

    let result = calculate(upstreamVersions, localVersions, 'release/v1', minimumVersion)
    expect(result).toBe(undefined)
  });

  it('next lowest - next minor', () => {
    const localVersions = makeVersions(["1.0.0", "1.0.1", "1.0.2"]);
    const minimumVersion = makeVersion("1.0.2");

    let result = calculate(upstreamVersions, localVersions, 'release/v1', minimumVersion)
    expect(result.compare(new SemVer("1.1.0"))).toEqual(0)
  });

  it('next lowest - next build', () => {
    const localVersions = makeVersions(["1.0.0", "1.0.1"]);
    const minimumVersion = makeVersion("1.0.1");

    let result = calculate(upstreamVersions, localVersions, 'release/v1', minimumVersion)
    expect(result.compare(new SemVer("1.0.2"))).toEqual(0)
  });

});

describe('calculate - branch release/v1.1', () => {

  it('return same minimum', () => {
    const localVersions = makeVersions(["1.0.0", "1.0.1", "1.0.2"]);
    const minimumVersion = makeVersion("1.1.0");

    let result = calculate(upstreamVersions, localVersions, 'release/v1.1', minimumVersion)
    expect(result.compare(makeVersion("1.1.0"))).toEqual(0)
  });

  it('next lowest - no next major', () => {
    const localVersions = makeVersions(["1.0.0",
      "1.0.1",
      "1.0.2",
      "1.1.0",
      "1.1.1",
      "1.1.2",
      "1.2.0",
      "1.2.1",
      "1.3.0",]);
    const minimumVersion = makeVersion("1.1.2");

    let result = calculate(upstreamVersions, localVersions, 'release/v1.1', minimumVersion)
    expect(result).toBe(undefined)
  });

  it('next lowest - no next minor', () => {
    const localVersions = makeVersions(["1.0.0",
      "1.0.1",
      "1.0.2",
      "1.1.0",
      "1.1.1",
      "1.1.2",
      "2.0.0",
    ]);
    const minimumVersion = makeVersion("1.1.2");

    let result = calculate(upstreamVersions, localVersions, 'release/v1.1', minimumVersion)
    expect(result).toBe(undefined)
  });

  it('next lowest - next build', () => {
    const localVersions = makeVersions(["1.0.0",
      "1.0.1",
      "1.0.2",
      "1.1.0",
      "1.1.1",
      "2.0.0",
    ]);
    const minimumVersion = makeVersion("1.1.1");

    let result = calculate(upstreamVersions, localVersions, 'release/v1.1', minimumVersion)
    expect(result.compare(new SemVer("1.1.2"))).toEqual(0)
  });

})