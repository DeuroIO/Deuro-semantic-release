import test from 'ava';
import {stub} from 'sinon';
import getNextVersion from '../lib/get-next-version';

test.beforeEach(t => {
  // Stub the logger functions
  t.context.log = stub();
  t.context.logger = {log: t.context.log};
});

test('Increase version for patch release', t => {
  t.is(getNextVersion({name: 'master', type: 'release'}, 'patch', {version: '1.0.0'}, t.context.logger), '1.0.1');
});

test('Increase version for minor release', t => {
  t.is(getNextVersion({name: 'master', type: 'release'}, 'minor', {version: '1.0.0'}, t.context.logger), '1.1.0');
});

test('Increase version for major release', t => {
  t.is(getNextVersion({name: 'master', type: 'release'}, 'major', {version: '1.0.0'}, t.context.logger), '2.0.0');
});

test('Return 1.0.0 if there is no previous release', t => {
  t.is(getNextVersion({name: 'master', type: 'release'}, 'minor', {}, t.context.logger), '1.0.0');
});

test('Increase version for patch release on prerelease branch', t => {
  t.is(
    getNextVersion(
      {name: 'beta', type: 'prerelease', prerelease: 'beta'},
      'patch',
      {version: '1.0.0'},
      t.context.logger
    ),
    '1.0.1-beta.0'
  );

  t.is(
    getNextVersion(
      {name: 'beta', type: 'prerelease', prerelease: 'beta'},
      'patch',
      {version: '1.0.0-beta.1'},
      t.context.logger
    ),
    '1.0.0-beta.2'
  );
});

test('Increase version for minor release on prerelease branch', t => {
  t.is(
    getNextVersion(
      {name: 'beta', type: 'prerelease', prerelease: 'beta'},
      'minor',
      {version: '1.0.0'},
      t.context.logger
    ),
    '1.1.0-beta.0'
  );

  t.is(
    getNextVersion(
      {name: 'beta', type: 'prerelease', prerelease: 'beta'},
      'minor',
      {version: '1.0.0-beta.1'},
      t.context.logger
    ),
    '1.0.0-beta.2'
  );
});

test('Increase version for major release on prerelease branch', t => {
  t.is(
    getNextVersion(
      {name: 'beta', type: 'prerelease', prerelease: 'beta'},
      'major',
      {version: '1.0.0'},
      t.context.logger
    ),
    '2.0.0-beta.0'
  );

  t.is(
    getNextVersion(
      {name: 'beta', type: 'prerelease', prerelease: 'beta'},
      'major',
      {version: '1.0.0-beta.1'},
      t.context.logger
    ),
    '1.0.0-beta.2'
  );
});

test('Return 1.0.0 if there is no previous release on prerelease branch', t => {
  t.is(
    getNextVersion({name: 'beta', type: 'prerelease', prerelease: 'beta'}, 'minor', {}, t.context.logger),
    '1.0.0-beta.0'
  );
});
