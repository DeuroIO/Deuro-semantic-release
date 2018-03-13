import test from 'ava';
import getTags from '../lib/get-tags';
import {gitRepo, gitCommits, gitTagVersion, gitCheckout} from './helpers/git-utils';

// Save the current working diretory
const cwd = process.cwd();

test.afterEach.always(() => {
  // Restore the current working directory
  process.chdir(cwd);
});

test.serial('Get the valid tags', async t => {
  await gitRepo();
  const commits = await gitCommits(['First']);
  await gitTagVersion('foo');
  await gitTagVersion('v2.0.0');
  commits.push(...(await gitCommits(['Second'])));
  await gitTagVersion('v1.0.0');
  commits.push(...(await gitCommits(['Third'])));
  await gitTagVersion('v3.0');
  commits.push(...(await gitCommits(['Fourth'])));
  await gitTagVersion('v3.0.0-beta.1');

  const result = await getTags({branches: [{name: 'master'}], tagFormat: `v\${version}`});

  t.deepEqual(result, [
    {
      name: 'master',
      tags: [
        {gitTag: 'v1.0.0', version: '1.0.0', channel: undefined, gitHead: commits[1].hash},
        {gitTag: 'v2.0.0', version: '2.0.0', channel: undefined, gitHead: commits[0].hash},
        {gitTag: 'v3.0.0-beta.1', version: '3.0.0-beta.1', channel: undefined, gitHead: commits[3].hash},
      ],
    },
  ]);
});

test.serial('Get the valid tags from multiple branches', async t => {
  await gitRepo();
  const commits = await gitCommits(['First']);
  await gitTagVersion('v1.0.0');
  await gitTagVersion('v1.0.0@1.x');
  commits.push(...(await gitCommits(['Second'])));
  await gitTagVersion('v1.1.0');
  await gitTagVersion('v1.1.0@1.x');
  await gitCheckout('1.x', true);
  await gitCheckout('master', false);
  commits.push(...(await gitCommits(['Third'])));
  await gitTagVersion('v2.0.0');
  await gitTagVersion('v2.0.0@next');
  await gitCheckout('next');
  commits.push(...(await gitCommits(['Fourth'])));
  await gitTagVersion('v3.0.0@next');

  const result = await getTags({
    branches: [{name: '1.x'}, {name: 'master'}, {name: 'next'}],
    tagFormat: `v\${version}`,
  });

  t.deepEqual(result, [
    {
      name: '1.x',
      tags: [
        {gitTag: 'v1.0.0', version: '1.0.0', channel: undefined, gitHead: commits[0].hash},
        {gitTag: 'v1.0.0@1.x', version: '1.0.0', channel: '1.x', gitHead: commits[0].hash},
        {gitTag: 'v1.1.0', version: '1.1.0', channel: undefined, gitHead: commits[1].hash},
        {gitTag: 'v1.1.0@1.x', version: '1.1.0', channel: '1.x', gitHead: commits[1].hash},
      ],
    },
    {
      name: 'master',
      tags: [
        ...result[0].tags,
        {gitTag: 'v2.0.0', version: '2.0.0', channel: undefined, gitHead: commits[2].hash},
        {gitTag: 'v2.0.0@next', version: '2.0.0', channel: 'next', gitHead: commits[2].hash},
      ],
    },
    {
      name: 'next',
      tags: [...result[1].tags, {gitTag: 'v3.0.0@next', version: '3.0.0', channel: 'next', gitHead: commits[3].hash}],
    },
  ]);
});

test.serial('Match the tag name from the begining of the string and the channel from the last "@"', async t => {
  await gitRepo();
  const commits = await gitCommits(['First']);
  await gitTagVersion('prefix@v1.0.0');
  await gitTagVersion('prefix@v1.0.0@next');
  await gitTagVersion('prefix@v2.0.0');
  await gitTagVersion('prefix@v2.0.0@next');
  await gitTagVersion('other-prefix@v3.0.0');

  const result = await getTags({branches: [{name: 'master'}], tagFormat: `prefix@v\${version}`});

  t.deepEqual(result, [
    {
      name: 'master',
      tags: [
        {gitTag: 'prefix@v1.0.0', version: '1.0.0', channel: undefined, gitHead: commits[0].hash},
        {gitTag: 'prefix@v1.0.0@next', version: '1.0.0', channel: 'next', gitHead: commits[0].hash},
        {gitTag: 'prefix@v2.0.0', version: '2.0.0', channel: undefined, gitHead: commits[0].hash},
        {gitTag: 'prefix@v2.0.0@next', version: '2.0.0', channel: 'next', gitHead: commits[0].hash},
      ],
    },
  ]);
});

test.serial('Return branches with and empty tags array if no valid tag is found', async t => {
  await gitRepo();
  await gitCommits(['First']);
  await gitTagVersion('foo');
  await gitCommits(['Second']);
  await gitTagVersion('v2.0.x');
  await gitCommits(['Third']);
  await gitTagVersion('v3.0');

  const result = await getTags({branches: [{name: 'master'}, {name: 'next'}], tagFormat: `prefix@v\${version}`});

  t.deepEqual(result, [{name: 'master', tags: []}, {name: 'next', tags: []}]);
});

test.serial(
  'Return branches with and empty tags array if no valid tag is found in history of configured branches',
  async t => {
    await gitRepo();
    await gitCommits(['First']);
    await gitCheckout('other-branch');
    await gitCommits(['Second']);
    await gitTagVersion('v1.0.0');
    await gitTagVersion('v1.0.0@next');
    await gitTagVersion('v2.0.0');
    await gitTagVersion('v2.0.0@next');
    await gitTagVersion('v3.0.0');
    await gitTagVersion('v3.0.0@next');
    await gitCheckout('master', false);

    const result = await getTags({branches: [{name: 'master'}, {name: 'next'}], tagFormat: `prefix@v\${version}`});

    t.deepEqual(result, [{name: 'master', tags: []}, {name: 'next', tags: []}]);
  }
);

test.serial('Get the highest valid tag corresponding to the "tagFormat"', async t => {
  await gitRepo();
  const commits = await gitCommits(['First']);

  await gitTagVersion('1.0.0');
  t.deepEqual(await getTags({branches: [{name: 'master'}], tagFormat: `\${version}`}), [
    {name: 'master', tags: [{gitTag: '1.0.0', version: '1.0.0', channel: undefined, gitHead: commits[0].hash}]},
  ]);

  await gitTagVersion('foo-1.0.0-bar');
  t.deepEqual(await getTags({branches: [{name: 'master'}], tagFormat: `foo-\${version}-bar`}), [
    {name: 'master', tags: [{gitTag: 'foo-1.0.0-bar', version: '1.0.0', channel: undefined, gitHead: commits[0].hash}]},
  ]);

  await gitTagVersion('foo-v1.0.0-bar');
  t.deepEqual(await getTags({branches: [{name: 'master'}], tagFormat: `foo-v\${version}-bar`}), [
    {
      name: 'master',
      tags: [{gitTag: 'foo-v1.0.0-bar', version: '1.0.0', channel: undefined, gitHead: commits[0].hash}],
    },
  ]);

  await gitTagVersion('(.+)/1.0.0/(a-z)');
  t.deepEqual(await getTags({branches: [{name: 'master'}], tagFormat: `(.+)/\${version}/(a-z)`}), [
    {
      name: 'master',
      tags: [{gitTag: '(.+)/1.0.0/(a-z)', version: '1.0.0', channel: undefined, gitHead: commits[0].hash}],
    },
  ]);

  await gitTagVersion('2.0.0-1.0.0-bar.1');
  t.deepEqual(await getTags({branches: [{name: 'master'}], tagFormat: `2.0.0-\${version}-bar.1`}), [
    {
      name: 'master',
      tags: [{gitTag: '2.0.0-1.0.0-bar.1', version: '1.0.0', channel: undefined, gitHead: commits[0].hash}],
    },
  ]);

  await gitTagVersion('3.0.0-bar.2');
  t.deepEqual(await getTags({branches: [{name: 'master'}], tagFormat: `\${version}-bar.2`}), [
    {name: 'master', tags: [{gitTag: '3.0.0-bar.2', version: '3.0.0', channel: undefined, gitHead: commits[0].hash}]},
  ]);
});
