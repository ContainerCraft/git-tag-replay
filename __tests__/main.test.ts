import * as core from '@actions/core';
import {run} from '../src/main';

describe('run', () => {
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(core, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the expected info message', async () => {
    await run();
    expect(infoSpy).toHaveBeenCalledWith('Git Tag Replay Action called');
  });

  it('resolves without throwing', async () => {
    await expect(run()).resolves.toBeUndefined();
  });
});
