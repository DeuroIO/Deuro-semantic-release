import test from 'ava';
import proxyquire from 'proxyquire';
import {spy, stub} from 'sinon';
import clearModule from 'clear-module';
import AggregateError from 'aggregate-error';
import SemanticReleaseError from '@semantic-release/error';
import DEFINITIONS from '../lib/definitions/plugins';
import {COMMIT_NAME, COMMIT_EMAIL} from '../lib/definitions/constants';
import {
  gitHead as getGitHead,
  gitCheckout,
  gitTagHead,
  gitRepo,
  gitCommits,
  gitTagVersion,
  gitRemoteTagHead,
  push,
  gitShallowClone,
  merge,
  mergeFf,
  rebase,
} from './helpers/git-utils';

// Save the current process.env
const envBackup = Object.assign({}, process.env);
// Save the current working diretory
const cwd = process.cwd();
const pluginNoop = require.resolve('./fixtures/plugin-noop');

test.beforeEach(t => {
  clearModule('../lib/hide-sensitive');
  // Delete environment variables that could have been set on the machine running the tests
  delete process.env.GIT_CREDENTIALS;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GL_TOKEN;
  delete process.env.GITLAB_TOKEN;
  // Stub the logger functions
  t.context.log = spy();
  t.context.error = spy();
  t.context.logger = {log: t.context.log, error: t.context.error};
  t.context.stdout = stub(process.stdout, 'write');
  t.context.stderr = stub(process.stderr, 'write');
});

test.afterEach.always(t => {
  // Restore process.env
  process.env = envBackup;
  // Restore the current working directory
  process.chdir(cwd);

  t.context.stdout.restore();
  t.context.stderr.restore();
});

test.serial('Plugins are called with expected values', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  let commits = await gitCommits(['First']);
  // Create the tag corresponding to version 1.0.0
  await gitTagVersion('v1.0.0@next');
  // Add new commits to the master branch
  commits = (await gitCommits(['Second'])).concat(commits);
  await gitCheckout('next');
  await push('origin', 'next');
  await gitCheckout('master', false);
  await push('origin');

  const lastRelease = {
    version: '1.0.0',
    gitHead: commits[commits.length - 1].hash,
    gitTag: 'v1.0.0@next',
    name: 'v1.0.0',
    channel: 'next',
  };
  const nextRelease = {
    name: 'v1.1.0',
    type: 'minor',
    version: '1.1.0',
    gitHead: await getGitHead(),
    gitTag: 'v1.1.0',
    channel: undefined,
  };
  const notes = 'Release notes';
  const verifyConditions1 = stub().resolves();
  const verifyConditions2 = stub().resolves();
  const analyzeCommits = stub().resolves(nextRelease.type);
  const verifyRelease = stub().resolves();
  const generateNotes = stub().resolves(notes);
  const release1 = {name: 'Release 1', url: 'https://release1.com'};
  const release2 = {name: 'Release 2', url: 'https://release2.com'};
  const addChannel = stub().resolves(release1);
  const prepare = stub().resolves();
  const publish = stub().resolves(release2);
  const success = stub().resolves();

  const config = {
    branches: [{name: 'master'}, {name: 'next'}],
    branch: 'master',
    repositoryUrl,
    globalOpt: 'global',
    tagFormat: `v\${version}`,
  };
  const branches = [
    {
      channel: undefined,
      name: 'master',
      range: '>=1.0.0 <2.0.0',
      tags: [{channel: 'next', gitTag: 'v1.0.0@next', version: '1.0.0', gitHead: commits[commits.length - 1].hash}],
      type: 'release',
    },
    {
      channel: 'next',
      name: 'next',
      range: '>=2.0.0',
      tags: [{channel: 'next', gitHead: commits[commits.length - 1].hash, gitTag: 'v1.0.0@next', version: '1.0.0'}],
      type: 'release',
    },
  ];
  const branch = branches[0];
  const options = {
    ...config,
    branch: 'master',
    verifyConditions: [verifyConditions1, verifyConditions2],
    analyzeCommits,
    verifyRelease,
    addChannel,
    generateNotes,
    prepare,
    publish: [publish, pluginNoop],
    success,
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  t.truthy(await semanticRelease(options));

  t.is(verifyConditions1.callCount, 1);
  t.deepEqual(verifyConditions1.args[0][0], {...config, branches});
  t.deepEqual(verifyConditions1.args[0][1], {options: {...options, branches}, branch, logger: t.context.logger});
  t.is(verifyConditions2.callCount, 1);
  t.deepEqual(verifyConditions2.args[0][1], {options: {...options, branches}, branch, logger: t.context.logger});

  t.is(addChannel.callCount, 1);
  t.deepEqual(addChannel.args[0][0], {...config, branches});
  t.deepEqual(addChannel.args[0][1].options, {...options, branches});
  t.deepEqual(addChannel.args[0][1].branch, branch);
  t.deepEqual(addChannel.args[0][1].logger, t.context.logger);
  t.deepEqual(addChannel.args[0][1].lastRelease, {});
  t.deepEqual(addChannel.args[0][1].currentRelease, {...lastRelease, type: 'major'});
  t.deepEqual(addChannel.args[0][1].nextRelease, {
    ...lastRelease,
    type: 'major',
    version: '1.0.0',
    channel: undefined,
    gitTag: 'v1.0.0',
    name: 'v1.0.0',
    notes,
  });
  t.deepEqual(addChannel.args[0][1].commits[0].hash, commits[1].hash);
  t.deepEqual(addChannel.args[0][1].commits[0].message, commits[1].message);

  t.is(analyzeCommits.callCount, 1);
  t.deepEqual(analyzeCommits.args[0][0], {...config, branches});
  t.deepEqual(analyzeCommits.args[0][1].options, {...options, branches});
  t.deepEqual(analyzeCommits.args[0][1].branch, branch);
  t.deepEqual(analyzeCommits.args[0][1].logger, t.context.logger);
  t.deepEqual(analyzeCommits.args[0][1].lastRelease, lastRelease);
  t.deepEqual(analyzeCommits.args[0][1].commits[0].hash, commits[0].hash);
  t.deepEqual(analyzeCommits.args[0][1].commits[0].message, commits[0].message);

  t.is(verifyRelease.callCount, 1);
  t.deepEqual(verifyRelease.args[0][0], {...config, branches});
  t.deepEqual(verifyRelease.args[0][1].options, {...options, branches});
  t.deepEqual(verifyRelease.args[0][1].branch, branch);
  t.deepEqual(verifyRelease.args[0][1].logger, t.context.logger);
  t.deepEqual(verifyRelease.args[0][1].lastRelease, lastRelease);
  t.deepEqual(verifyRelease.args[0][1].commits[0].hash, commits[0].hash);
  t.deepEqual(verifyRelease.args[0][1].commits[0].message, commits[0].message);
  t.deepEqual(verifyRelease.args[0][1].nextRelease, nextRelease);

  t.is(generateNotes.callCount, 2);
  t.deepEqual(generateNotes.args[0][0], {...config, branches});
  t.deepEqual(generateNotes.args[0][1].options, {...options, branches});
  t.deepEqual(generateNotes.args[0][1].branch, branch);
  t.deepEqual(generateNotes.args[0][1].logger, t.context.logger);
  t.deepEqual(generateNotes.args[0][1].lastRelease, {});
  t.deepEqual(generateNotes.args[0][1].commits[0].hash, commits[1].hash);
  t.deepEqual(generateNotes.args[0][1].commits[0].message, commits[1].message);
  t.deepEqual(generateNotes.args[0][1].nextRelease, {
    ...lastRelease,
    type: 'major',
    version: '1.0.0',
    channel: undefined,
    gitTag: 'v1.0.0',
    name: 'v1.0.0',
  });
  t.deepEqual(generateNotes.args[1][0], {...config, branches});
  t.deepEqual(generateNotes.args[1][1].options, {...options, branches});
  t.deepEqual(generateNotes.args[0][1].branch, branch);
  t.deepEqual(generateNotes.args[1][1].logger, t.context.logger);
  t.deepEqual(generateNotes.args[1][1].lastRelease, lastRelease);
  t.deepEqual(generateNotes.args[1][1].commits[0].hash, commits[0].hash);
  t.deepEqual(generateNotes.args[1][1].commits[0].message, commits[0].message);
  t.deepEqual(generateNotes.args[1][1].nextRelease, nextRelease);

  t.is(prepare.callCount, 1);
  t.deepEqual(prepare.args[0][0], {...config, branches});
  t.deepEqual(prepare.args[0][1].options, {...options, branches});
  t.deepEqual(prepare.args[0][1].branch, branch);
  t.deepEqual(prepare.args[0][1].logger, t.context.logger);
  t.deepEqual(prepare.args[0][1].lastRelease, lastRelease);
  t.deepEqual(prepare.args[0][1].commits[0].hash, commits[0].hash);
  t.deepEqual(prepare.args[0][1].commits[0].message, commits[0].message);
  t.deepEqual(prepare.args[0][1].nextRelease, {...nextRelease, notes});

  t.is(publish.callCount, 1);
  t.deepEqual(publish.args[0][0], {...config, branches});
  t.deepEqual(publish.args[0][1].options, {...options, branches});
  t.deepEqual(publish.args[0][1].branch, branch);
  t.deepEqual(publish.args[0][1].logger, t.context.logger);
  t.deepEqual(publish.args[0][1].lastRelease, lastRelease);
  t.deepEqual(publish.args[0][1].commits[0].hash, commits[0].hash);
  t.deepEqual(publish.args[0][1].commits[0].message, commits[0].message);
  t.deepEqual(publish.args[0][1].nextRelease, {...nextRelease, notes});

  t.is(success.callCount, 2);
  t.deepEqual(success.args[0][0], {...config, branches});
  t.deepEqual(success.args[0][1].options, {...options, branches});
  t.deepEqual(success.args[0][1].branch, branch);
  t.deepEqual(success.args[0][1].logger, t.context.logger);
  t.deepEqual(success.args[0][1].lastRelease, {});
  t.deepEqual(success.args[0][1].commits[0].hash, commits[1].hash);
  t.deepEqual(success.args[0][1].commits[0].message, commits[1].message);
  t.deepEqual(success.args[0][1].nextRelease, {
    ...lastRelease,
    type: 'major',
    version: '1.0.0',
    channel: undefined,
    gitTag: 'v1.0.0',
    name: 'v1.0.0',
    notes,
  });
  t.deepEqual(success.args[0][1].releases, [
    {
      ...release1,
      ...lastRelease,
      type: 'major',
      version: '1.0.0',
      channel: undefined,
      gitTag: 'v1.0.0',
      name: 'v1.0.0',
      notes,
      pluginName: '[Function: proxy]',
    },
  ]);

  t.deepEqual(success.args[1][0], {...config, branches});
  t.deepEqual(success.args[1][1].options, {...options, branches});
  t.deepEqual(success.args[0][1].branch, branch);
  t.deepEqual(success.args[1][1].logger, t.context.logger);
  t.deepEqual(success.args[1][1].lastRelease, lastRelease);
  t.deepEqual(success.args[1][1].commits[0].hash, commits[0].hash);
  t.deepEqual(success.args[1][1].commits[0].message, commits[0].message);
  t.deepEqual(success.args[1][1].nextRelease, {...nextRelease, notes});
  t.deepEqual(success.args[1][1].releases, [
    {...release2, ...nextRelease, notes, pluginName: '[Function: proxy]'},
    {...nextRelease, notes, pluginName: pluginNoop},
  ]);

  // Verify the tag has been created on the local and remote repo and reference the gitHead
  t.is(await gitTagHead(nextRelease.gitTag), nextRelease.gitHead);
  t.is(await gitRemoteTagHead(repositoryUrl, nextRelease.gitTag), nextRelease.gitHead);

  // Verify the author/commiter name and email hve been set
  t.is(process.env.GIT_AUTHOR_NAME, COMMIT_NAME);
  t.is(process.env.GIT_AUTHOR_EMAIL, COMMIT_EMAIL);
  t.is(process.env.GIT_COMMITTER_NAME, COMMIT_NAME);
  t.is(process.env.GIT_COMMITTER_EMAIL, COMMIT_EMAIL);
});

test.serial('Use custom tag format', async t => {
  const repositoryUrl = await gitRepo(true);
  await gitCommits(['First']);
  await gitTagVersion('test-1.0.0');
  await gitCommits(['Second']);
  await push();

  const nextRelease = {
    name: 'test-2.0.0',
    type: 'major',
    version: '2.0.0',
    gitHead: await getGitHead(),
    gitTag: 'test-2.0.0',
  };
  const notes = 'Release notes';
  const config = {branch: 'master', repositoryUrl, globalOpt: 'global', tagFormat: `test-\${version}`};
  const options = {
    ...config,
    verifyConditions: stub().resolves(),
    analyzeCommits: stub().resolves(nextRelease.type),
    verifyRelease: stub().resolves(),
    generateNotes: stub().resolves(notes),
    addChannel: stub().resolves(),
    prepare: stub().resolves(),
    publish: stub().resolves(),
    success: stub().resolves(),
    fail: stub().resolves(),
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  t.truthy(await semanticRelease(options));

  // Verify the tag has been created on the local and remote repo and reference the gitHead
  t.is(await gitTagHead(nextRelease.gitTag), nextRelease.gitHead);
  t.is(await gitRemoteTagHead(repositoryUrl, nextRelease.gitTag), nextRelease.gitHead);
});

test.serial('Use new gitHead, and recreate release notes if a prepare plugin create a commit', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  let commits = await gitCommits(['First']);
  // Create the tag corresponding to version 1.0.0
  await gitTagVersion('v1.0.0');
  // Add new commits to the master branch
  commits = (await gitCommits(['Second'])).concat(commits);
  await push();

  const nextRelease = {
    name: 'v2.0.0',
    type: 'major',
    version: '2.0.0',
    gitHead: await getGitHead(),
    gitTag: 'v2.0.0',
    channel: undefined,
  };
  const notes = 'Release notes';

  const generateNotes = stub().resolves(notes);
  const prepare1 = stub().callsFake(async () => {
    commits = (await gitCommits(['Third'])).concat(commits);
  });
  const prepare2 = stub().resolves();
  const publish = stub().resolves();

  const options = {
    branch: 'master',
    repositoryUrl,
    verifyConditions: stub().resolves(),
    analyzeCommits: stub().resolves(nextRelease.type),
    verifyRelease: stub().resolves(),
    generateNotes,
    addChannel: stub().resolves(),
    prepare: [prepare1, prepare2],
    publish,
    success: stub().resolves(),
    fail: stub().resolves(),
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });

  t.truthy(await semanticRelease(options));

  t.is(generateNotes.callCount, 2);
  t.deepEqual(generateNotes.args[0][1].nextRelease, nextRelease);
  t.is(prepare1.callCount, 1);
  t.deepEqual(prepare1.args[0][1].nextRelease, {...nextRelease, notes});

  nextRelease.gitHead = await getGitHead();

  t.deepEqual(generateNotes.args[1][1].nextRelease, {...nextRelease, notes});
  t.is(prepare2.callCount, 1);
  t.deepEqual(prepare2.args[0][1].nextRelease, {...nextRelease, notes});

  t.is(publish.callCount, 1);
  t.deepEqual(publish.args[0][1].nextRelease, {...nextRelease, notes});

  // Verify the tag has been created on the local and remote repo and reference the last gitHead
  t.is(await gitTagHead(nextRelease.gitTag), commits[0].hash);
  t.is(await gitRemoteTagHead(repositoryUrl, nextRelease.gitTag), commits[0].hash);
});

test.serial('Make a new release when a commit is forward-ported to an upper branch', async t => {
  const repositoryUrl = await gitRepo(true);
  const commits = await gitCommits(['feat: initial release']);
  await gitTagVersion('v1.0.0');
  await gitTagVersion('v1.0.0@1.0.x');
  await gitCheckout('1.0.x');
  commits.push(...(await gitCommits(['fix: fix on LTS version 1.0.x'])));
  await gitTagVersion('v1.0.1@1.0.x');
  await push('origin', '1.0.x');
  await gitCheckout('master', false);
  commits.push(...(await gitCommits(['feat: new feature on master'])));
  await gitTagVersion('v1.1.0');
  await merge('1.0.x');
  await push('origin');

  const verifyConditions = stub().resolves();
  const verifyRelease = stub().resolves();
  const addChannel = stub().resolves();
  const prepare = stub().resolves();
  const publish = stub().resolves();
  const success = stub().resolves();

  const config = {branches: [{name: '1.0.x'}, {name: 'master'}], repositoryUrl, tagFormat: `v\${version}`};
  const options = {
    ...config,
    verifyConditions,
    verifyRelease,
    addChannel,
    prepare,
    publish,
    success,
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  t.truthy(await semanticRelease(options));

  t.is(addChannel.callCount, 0);
  t.is(publish.callCount, 1);
  // The release 1.1.1, triggered by the forward-port of "fix: fix on LTS version 1.0.x" has been published from master
  t.is(publish.args[0][1].nextRelease.version, '1.1.1');
  t.is(success.callCount, 1);
});

test.serial('Do not add pre-releases to a different channel', async t => {
  const repositoryUrl = await gitRepo(true);
  const commits = await gitCommits(['feat: initial release']);
  await gitTagVersion('v1.0.0');
  await gitTagVersion('v1.0.0@beta');
  await gitCheckout('beta');
  commits.push(...(await gitCommits(['feat: breaking change/n/nBREAKING CHANGE: break something'])));
  await gitTagVersion('v2.0.0-beta.1@beta');
  commits.push(...(await gitCommits(['fix: a fix'])));
  await gitTagVersion('v2.0.0-beta.2@beta');
  await push('origin', 'beta');
  await gitCheckout('master', false);
  await merge('beta');
  await push('origin');

  const verifyConditions = stub().resolves();
  const verifyRelease = stub().resolves();
  const generateNotes = stub().resolves('Release notes');
  const release1 = {name: 'Release 1', url: 'https://release1.com'};
  const addChannel = stub().resolves(release1);
  const prepare = stub().resolves();
  const publish = stub().resolves();
  const success = stub().resolves();

  const config = {
    branches: [{name: 'master'}, {name: 'beta', prerelease: 'beta'}],
    repositoryUrl,
    tagFormat: `v\${version}`,
  };

  const options = {
    ...config,
    verifyConditions,
    verifyRelease,
    addChannel,
    generateNotes,
    prepare,
    publish,
    success,
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  t.truthy(await semanticRelease(options));

  t.is(addChannel.callCount, 0);
});

async function addChannelMacro(t, mergeFunction) {
  const repositoryUrl = await gitRepo(true);
  const commits = await gitCommits(['feat: initial release']);
  await gitTagVersion('v1.0.0');
  await gitTagVersion('v1.0.0@next');
  await gitCheckout('next');
  commits.push(...(await gitCommits(['feat: breaking change/n/nBREAKING CHANGE: break something'])));
  await gitTagVersion('v2.0.0@next');
  commits.push(...(await gitCommits(['fix: a fix'])));
  await gitTagVersion('v2.0.1@next');
  commits.push(...(await gitCommits(['feat: a feature'])));
  await gitTagVersion('v2.1.0@next');
  await push('origin', 'next');
  await gitCheckout('master', false);
  // Merge all commits but last one from next to master
  await mergeFunction('next~1');
  await push('origin');

  const notes = 'Release notes';
  const verifyConditions = stub().resolves();
  const verifyRelease = stub().resolves();
  const generateNotes = stub().resolves(notes);
  const release1 = {name: 'Release 1', url: 'https://release1.com'};
  const addChannel1 = stub().resolves(release1);
  const addChannel2 = stub().resolves();
  const prepare = stub().resolves();
  const publish = stub().resolves();
  const success = stub().resolves();

  const config = {branches: [{name: 'master'}, {name: 'next'}], repositoryUrl, tagFormat: `v\${version}`};
  const branches = [
    {
      channel: undefined,
      name: 'master',
      range: '>=2.0.1 <2.1.0',
      tags: [
        {channel: undefined, gitTag: 'v1.0.0', version: '1.0.0', gitHead: commits[0].hash},
        {channel: 'next', gitTag: 'v1.0.0@next', version: '1.0.0', gitHead: commits[0].hash},
        {channel: 'next', gitHead: commits[1].hash, gitTag: 'v2.0.0@next', version: '2.0.0'},
        {channel: 'next', gitHead: commits[2].hash, gitTag: 'v2.0.1@next', version: '2.0.1'},
      ],
      type: 'release',
    },
    {
      channel: 'next',
      name: 'next',
      range: '>=2.1.0',
      tags: [
        {channel: undefined, gitTag: 'v1.0.0', version: '1.0.0', gitHead: commits[0].hash},
        {channel: 'next', gitTag: 'v1.0.0@next', version: '1.0.0', gitHead: commits[0].hash},
        {channel: 'next', gitHead: commits[1].hash, gitTag: 'v2.0.0@next', version: '2.0.0'},
        {channel: 'next', gitHead: commits[2].hash, gitTag: 'v2.0.1@next', version: '2.0.1'},
        {channel: 'next', gitHead: commits[3].hash, gitTag: 'v2.1.0@next', version: '2.1.0'},
      ],
      type: 'release',
    },
  ];
  const branch = 'master';
  const options = {
    ...config,
    verifyConditions,
    verifyRelease,
    addChannel: [addChannel1, addChannel2],
    generateNotes,
    prepare,
    publish,
    success,
  };
  const lastRelease1 = {
    name: 'v1.0.0',
    channel: undefined,
    gitHead: commits[0].hash,
    gitTag: 'v1.0.0',
    version: '1.0.0',
  };
  const currentRelease1 = {
    name: 'v2.0.0',
    type: 'major',
    version: '2.0.0',
    channel: 'next',
    gitTag: 'v2.0.0@next',
    gitHead: commits[1].hash,
  };
  const nextRelease1 = {
    name: 'v2.0.0',
    type: 'major',
    version: '2.0.0',
    channel: undefined,
    gitTag: 'v2.0.0',
    gitHead: commits[1].hash,
  };
  const lastRelease2 = {
    name: 'v2.0.0',
    channel: 'next',
    gitHead: commits[1].hash,
    gitTag: 'v2.0.0@next',
    version: '2.0.0',
  };
  const currentRelease2 = {
    name: 'v2.0.1',
    type: 'patch',
    version: '2.0.1',
    channel: 'next',
    gitTag: 'v2.0.1@next',
    gitHead: commits[2].hash,
  };
  const nextRelease2 = {
    name: 'v2.0.1',
    type: 'patch',
    version: '2.0.1',
    channel: undefined,
    gitTag: 'v2.0.1',
    gitHead: commits[2].hash,
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  t.falsy(await semanticRelease(options));

  t.is(addChannel1.callCount, 2);
  t.deepEqual(addChannel1.args[0][0], {...config, branches, branch});
  t.deepEqual(addChannel1.args[0][1].lastRelease, lastRelease1);
  t.deepEqual(addChannel1.args[0][1].currentRelease, currentRelease1);
  t.deepEqual(addChannel1.args[0][1].nextRelease, {...nextRelease1, notes});
  t.deepEqual(addChannel1.args[0][1].commits[0].hash, commits[1].hash);
  t.deepEqual(addChannel1.args[0][1].commits[0].message, commits[1].message);
  t.deepEqual(addChannel1.args[1][0], {...config, branches, branch});
  t.deepEqual(addChannel1.args[1][0], {...config, branches, branch});
  t.deepEqual(addChannel1.args[1][1].lastRelease, lastRelease2);
  t.deepEqual(addChannel1.args[1][1].currentRelease, currentRelease2);
  t.deepEqual(addChannel1.args[1][1].nextRelease, {...nextRelease2, notes});
  t.deepEqual(addChannel1.args[1][1].commits[0].hash, commits[2].hash);
  t.deepEqual(addChannel1.args[1][1].commits[0].message, commits[2].message);

  t.is(addChannel2.callCount, 2);
  t.deepEqual(addChannel2.args[0][0], {...config, branches, branch});
  t.deepEqual(addChannel2.args[0][1].lastRelease, lastRelease1);
  t.deepEqual(addChannel2.args[0][1].currentRelease, currentRelease1);
  t.deepEqual(addChannel2.args[0][1].nextRelease, {...nextRelease1, notes});
  t.deepEqual(addChannel2.args[0][1].commits[0].hash, commits[1].hash);
  t.deepEqual(addChannel2.args[0][1].commits[0].message, commits[1].message);
  t.deepEqual(addChannel2.args[1][0], {...config, branches, branch});
  t.deepEqual(addChannel2.args[1][0], {...config, branches, branch});
  t.deepEqual(addChannel2.args[1][1].lastRelease, lastRelease2);
  t.deepEqual(addChannel2.args[1][1].currentRelease, currentRelease2);
  t.deepEqual(addChannel2.args[1][1].nextRelease, {...nextRelease2, notes});
  t.deepEqual(addChannel2.args[1][1].commits[0].hash, commits[2].hash);
  t.deepEqual(addChannel2.args[1][1].commits[0].message, commits[2].message);

  t.is(generateNotes.callCount, 2);
  t.deepEqual(generateNotes.args[0][1].nextRelease, nextRelease1);
  t.deepEqual(generateNotes.args[1][1].nextRelease, nextRelease2);

  t.is(verifyRelease.callCount, 0);
  t.is(prepare.callCount, 0);
  t.is(publish.callCount, 0);

  t.is(success.callCount, 2);
  t.deepEqual(success.args[0][1].lastRelease, lastRelease1);
  t.deepEqual(success.args[0][1].nextRelease, {...nextRelease1, notes});
  t.deepEqual(success.args[0][1].commits[0].hash, commits[1].hash);
  t.deepEqual(success.args[0][1].commits[0].message, commits[1].message);
  t.deepEqual(success.args[0][1].releases, [
    {...release1, ...nextRelease1, notes, pluginName: '[Function: proxy]'},
    {...nextRelease1, notes, pluginName: '[Function: proxy]'},
  ]);
  t.deepEqual(success.args[1][1].lastRelease, lastRelease2);
  t.deepEqual(success.args[1][1].nextRelease, {...nextRelease2, notes});
  t.deepEqual(success.args[1][1].commits[0].hash, commits[2].hash);
  t.deepEqual(success.args[1][1].commits[0].message, commits[2].message);
  t.deepEqual(success.args[1][1].releases, [
    {...release1, ...nextRelease2, notes, pluginName: '[Function: proxy]'},
    {...nextRelease2, notes, pluginName: '[Function: proxy]'},
  ]);

  // Verify the tag has been created on the local and remote repo and reference
  t.is(await gitTagHead(nextRelease1.gitTag), nextRelease1.gitHead);
  t.is(await gitRemoteTagHead(repositoryUrl, nextRelease1.gitTag), nextRelease1.gitHead);
  t.is(await gitTagHead(nextRelease2.gitTag), nextRelease2.gitHead);
  t.is(await gitRemoteTagHead(repositoryUrl, nextRelease2.gitTag), nextRelease2.gitHead);
}

addChannelMacro.title = providedTitle => `Add version to a channel after a merge (${providedTitle})`;

test.serial('fast-forward', addChannelMacro, mergeFf);
test.serial('non fast-forward', addChannelMacro, merge);
test.serial('rebase', addChannelMacro, rebase);

test.serial('Call all "success" plugins even if one errors out', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  const commits = await gitCommits(['First']);
  // Create the tag corresponding to version 1.0.0
  await gitTagVersion('v1.0.0');
  // Add new commits to the master branch
  await gitCommits(['Second']);
  await push();

  const nextRelease = {
    name: 'v2.0.0',
    type: 'major',
    version: '2.0.0',
    gitHead: await getGitHead(),
    gitTag: 'v2.0.0',
    channel: undefined,
  };
  const notes = 'Release notes';
  const verifyConditions1 = stub().resolves();
  const verifyConditions2 = stub().resolves();
  const analyzeCommits = stub().resolves(nextRelease.type);
  const generateNotes = stub().resolves(notes);
  const release = {name: 'Release', url: 'https://release.com'};
  const publish = stub().resolves(release);
  const success1 = stub().rejects();
  const success2 = stub().resolves();

  const config = {branch: 'master', repositoryUrl, globalOpt: 'global', tagFormat: `v\${version}`};
  const branches = [
    {
      channel: undefined,
      name: 'master',
      range: '>=1.0.0',
      tags: [{channel: undefined, gitTag: 'v1.0.0', version: '1.0.0', gitHead: commits[commits.length - 1].hash}],
      type: 'release',
    },
  ];
  const branch = 'master';
  const options = {
    ...config,
    verifyConditions: [verifyConditions1, verifyConditions2],
    analyzeCommits,
    generateNotes,
    addChannel: stub().resolves(),
    prepare: stub().resolves(),
    publish,
    success: [success1, success2],
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });

  await t.throws(semanticRelease(options));

  t.is(success1.callCount, 1);
  t.deepEqual(success1.args[0][0], {...config, branches, branch});
  t.deepEqual(success1.args[0][1].releases, [{...release, ...nextRelease, notes, pluginName: '[Function: proxy]'}]);

  t.is(success2.callCount, 1);
  t.deepEqual(success2.args[0][1].releases, [{...release, ...nextRelease, notes, pluginName: '[Function: proxy]'}]);
});

test.serial('Log all "verifyConditions" errors', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  await gitCommits(['First']);
  await push();

  const error1 = new Error('error 1');
  const error2 = new SemanticReleaseError('error 2', 'ERR2');
  const error3 = new SemanticReleaseError('error 3', 'ERR3');
  const fail = stub().resolves();
  const config = {branch: 'master', repositoryUrl, tagFormat: `v\${version}`};
  const branches = [
    {
      channel: undefined,
      name: 'master',
      range: '>=1.0.0',
      tags: [],
      type: 'release',
    },
  ];
  const branch = 'master';
  const options = {
    ...config,
    verifyConditions: [stub().rejects(new AggregateError([error1, error2])), stub().rejects(error3)],
    fail,
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  const errors = [...(await t.throws(semanticRelease(options)))];

  t.deepEqual(errors, [error1, error2, error3]);
  t.deepEqual(t.context.log.args[t.context.log.args.length - 2], ['%s error 2', 'ERR2']);
  t.deepEqual(t.context.log.args[t.context.log.args.length - 1], ['%s error 3', 'ERR3']);
  t.deepEqual(t.context.error.args[t.context.error.args.length - 1], [
    'An error occurred while running semantic-release: %O',
    error1,
  ]);
  t.true(t.context.error.calledAfter(t.context.log));
  t.is(fail.callCount, 1);
  t.deepEqual(fail.args[0][0], {...config, branches, branch});
  t.deepEqual(fail.args[0][1].options, {...options, branches, branch});
  t.deepEqual(fail.args[0][1].logger, t.context.logger);
  t.deepEqual(fail.args[0][1].errors, [error2, error3]);
});

test.serial('Log all "verifyRelease" errors', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  const commits = await gitCommits(['First']);
  // Create the tag corresponding to version 1.0.0
  await gitTagVersion('v1.0.0');
  // Add new commits to the master branch
  await gitCommits(['Second']);
  await push();

  const error1 = new SemanticReleaseError('error 1', 'ERR1');
  const error2 = new SemanticReleaseError('error 2', 'ERR2');
  const fail = stub().resolves();
  const config = {branch: 'master', repositoryUrl, tagFormat: `v\${version}`};
  const branches = [
    {
      channel: undefined,
      name: 'master',
      range: '>=1.0.0',
      tags: [{channel: undefined, gitTag: 'v1.0.0', version: '1.0.0', gitHead: commits[commits.length - 1].hash}],
      type: 'release',
    },
  ];
  const branch = 'master';
  const options = {
    ...config,
    verifyConditions: stub().resolves(),
    analyzeCommits: stub().resolves('major'),
    verifyRelease: [stub().rejects(error1), stub().rejects(error2)],
    fail,
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  const errors = [...(await t.throws(semanticRelease(options)))];

  t.deepEqual(errors, [error1, error2]);
  t.deepEqual(t.context.log.args[t.context.log.args.length - 2], ['%s error 1', 'ERR1']);
  t.deepEqual(t.context.log.args[t.context.log.args.length - 1], ['%s error 2', 'ERR2']);
  t.is(fail.callCount, 1);
  t.deepEqual(fail.args[0][0], {...config, branches, branch});
  t.deepEqual(fail.args[0][1].errors, [error1, error2]);
});

test.serial('Dry-run skips publish and success', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  await gitCommits(['First']);
  // Create the tag corresponding to version 1.0.0
  await gitTagVersion('v1.0.0');
  // Add new commits to the master branch
  await gitCommits(['Second']);
  await push();

  const nextRelease = {
    name: 'v2.0.0',
    type: 'major',
    version: '2.0.0',
    gitHead: await getGitHead(),
    gitTag: 'v2.0.0',
    channel: undefined,
  };
  const notes = 'Release notes';

  const verifyConditions = stub().resolves();
  const analyzeCommits = stub().resolves(nextRelease.type);
  const verifyRelease = stub().resolves();
  const generateNotes = stub().resolves(notes);
  const publish = stub().resolves();
  const success = stub().resolves();

  const options = {
    dryRun: true,
    branch: 'master',
    repositoryUrl,
    verifyConditions,
    analyzeCommits,
    verifyRelease,
    generateNotes,
    addChannel: stub().resolves(),
    prepare: stub().resolves(),
    publish,
    success,
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  t.truthy(await semanticRelease(options));

  t.not(t.context.log.args[0][0], 'This run was not triggered in a known CI environment, running in dry-run mode.');
  t.is(verifyConditions.callCount, 1);
  t.is(analyzeCommits.callCount, 1);
  t.is(verifyRelease.callCount, 1);
  t.is(generateNotes.callCount, 1);
  t.is(publish.callCount, 0);
  t.is(success.callCount, 0);
});

test.serial('Dry-run skips fail', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  await gitCommits(['First']);
  // Create the tag corresponding to version 1.0.0
  await gitTagVersion('v1.0.0');
  // Add new commits to the master branch
  await gitCommits(['Second']);
  await push();

  const error1 = new SemanticReleaseError('error 1', 'ERR1');
  const error2 = new SemanticReleaseError('error 2', 'ERR2');
  const fail = stub().resolves();

  const options = {
    dryRun: true,
    branch: 'master',
    repositoryUrl,
    verifyConditions: [stub().rejects(error1), stub().rejects(error2)],
    fail,
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  const errors = [...(await t.throws(semanticRelease(options)))];

  t.deepEqual(errors, [error1, error2]);
  t.deepEqual(t.context.log.args[t.context.log.args.length - 2], ['%s error 1', 'ERR1']);
  t.deepEqual(t.context.log.args[t.context.log.args.length - 1], ['%s error 2', 'ERR2']);
  t.is(fail.callCount, 0);
});

test.serial('Force a dry-run if not on a CI and "noCi" is not explicitly set', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  await gitCommits(['First']);
  // Create the tag corresponding to version 1.0.0
  await gitTagVersion('v1.0.0');
  // Add new commits to the master branch
  await gitCommits(['Second']);
  await push();

  const nextRelease = {
    name: 'v2.0.0',
    type: 'major',
    version: '2.0.0',
    gitHead: await getGitHead(),
    gitTag: 'v2.0.0',
    channel: undefined,
  };
  const notes = 'Release notes';

  const verifyConditions = stub().resolves();
  const analyzeCommits = stub().resolves(nextRelease.type);
  const verifyRelease = stub().resolves();
  const generateNotes = stub().resolves(notes);
  const publish = stub().resolves();
  const success = stub().resolves();

  const options = {
    dryRun: false,
    branch: 'master',
    repositoryUrl,
    verifyConditions,
    analyzeCommits,
    verifyRelease,
    generateNotes,
    addChannel: stub().resolves(),
    prepare: stub().resolves(),
    publish,
    success,
    fail: stub().resolves(),
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: false, branch: 'master'}),
  });
  t.truthy(await semanticRelease(options));

  t.is(t.context.log.args[1][0], 'This run was not triggered in a known CI environment, running in dry-run mode.');
  t.is(verifyConditions.callCount, 1);
  t.is(analyzeCommits.callCount, 1);
  t.is(verifyRelease.callCount, 1);
  t.is(generateNotes.callCount, 1);
  t.is(publish.callCount, 0);
  t.is(success.callCount, 0);
});

test.serial('Allow local releases with "noCi" option', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  await gitCommits(['First']);
  // Create the tag corresponding to version 1.0.0
  await gitTagVersion('v1.0.0');
  // Add new commits to the master branch
  await gitCommits(['Second']);
  await push();

  const nextRelease = {
    name: 'v2.0.0',
    type: 'major',
    version: '2.0.0',
    gitHead: await getGitHead(),
    gitTag: 'v2.0.0',
    channel: undefined,
  };
  const notes = 'Release notes';

  const verifyConditions = stub().resolves();
  const analyzeCommits = stub().resolves(nextRelease.type);
  const verifyRelease = stub().resolves();
  const generateNotes = stub().resolves(notes);
  const publish = stub().resolves();
  const success = stub().resolves();

  const options = {
    noCi: true,
    branch: 'master',
    repositoryUrl,
    verifyConditions,
    analyzeCommits,
    verifyRelease,
    generateNotes,
    addChannel: stub().resolves(),
    prepare: stub().resolves(),
    publish,
    success,
    fail: stub().resolves(),
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: false, branch: 'master', isPr: true}),
  });
  t.truthy(await semanticRelease(options));

  t.not(t.context.log.args[0][0], 'This run was not triggered in a known CI environment, running in dry-run mode.');
  t.not(
    t.context.log.args[0][0],
    "This run was triggered by a pull request and therefore a new version won't be published."
  );
  t.is(verifyConditions.callCount, 1);
  t.is(analyzeCommits.callCount, 1);
  t.is(verifyRelease.callCount, 1);
  t.is(generateNotes.callCount, 1);
  t.is(publish.callCount, 1);
  t.is(success.callCount, 1);
});

test.serial('Accept "undefined" value returned by the "generateNotes" plugins', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  let commits = await gitCommits(['First']);
  // Create the tag corresponding to version 1.0.0
  await gitTagVersion('v1.0.0');
  // Add new commits to the master branch
  commits = (await gitCommits(['Second'])).concat(commits);
  await push();

  const lastRelease = {
    name: 'v1.0.0',
    version: '1.0.0',
    gitHead: commits[commits.length - 1].hash,
    gitTag: 'v1.0.0',
    channel: undefined,
  };
  const nextRelease = {
    name: 'v2.0.0',
    type: 'major',
    version: '2.0.0',
    gitHead: await getGitHead(),
    gitTag: 'v2.0.0',
    channel: undefined,
  };
  const analyzeCommits = stub().resolves(nextRelease.type);
  const verifyRelease = stub().resolves();
  const generateNotes = stub().resolves();
  const publish = stub().resolves();

  const options = {
    branch: 'master',
    repositoryUrl,
    verifyConditions: stub().resolves(),
    analyzeCommits,
    verifyRelease,
    generateNotes,
    addChannel: stub().resolves(),
    prepare: stub().resolves(),
    publish,
    success: stub().resolves(),
    fail: stub().resolves(),
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  t.truthy(await semanticRelease(options));

  t.is(analyzeCommits.callCount, 1);
  t.deepEqual(analyzeCommits.args[0][1].lastRelease, lastRelease);

  t.is(verifyRelease.callCount, 1);
  t.deepEqual(verifyRelease.args[0][1].lastRelease, lastRelease);

  t.is(generateNotes.callCount, 1);
  t.deepEqual(generateNotes.args[0][1].lastRelease, lastRelease);

  t.is(publish.callCount, 1);
  t.deepEqual(publish.args[0][1].lastRelease, lastRelease);
  t.falsy(publish.args[0][1].nextRelease.notes);
});

test.serial('Returns falsy value if triggered by a PR', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: true}),
  });

  t.falsy(await semanticRelease({repositoryUrl}));
  t.is(
    t.context.log.args[t.context.log.args.length - 1][0],
    "This run was triggered by a pull request and therefore a new version won't be published."
  );
});

test.serial('Throws "EINVALIDNEXTVERSION" if next release is out of range of the current branch', async t => {
  const repositoryUrl = await gitRepo(true);
  const commits = await gitCommits(['feat: initial release']);
  await gitTagVersion('v1.0.0');
  await gitTagVersion('v1.0.0@1.x');
  await gitCheckout('1.x');
  await push('origin', '1.x');
  await gitCheckout('master', false);
  commits.push(...(await gitCommits(['feat: new feature on master'])));
  await gitTagVersion('v1.1.0');
  await gitCheckout('1.x', false);
  commits.push(...(await gitCommits(['feat: feat on LTS version 1.x'])));
  await push('origin');

  const verifyConditions = stub().resolves();
  const verifyRelease = stub().resolves();
  const addChannel = stub().resolves();
  const prepare = stub().resolves();
  const publish = stub().resolves();
  const success = stub().resolves();

  const config = {branches: [{name: '1.x'}, {name: 'master'}], repositoryUrl, tagFormat: `v\${version}`};
  const options = {
    ...config,
    verifyConditions,
    verifyRelease,
    addChannel,
    prepare,
    publish,
    success,
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: '1.x', isPr: false}),
  });

  const error = await t.throws(semanticRelease(options));

  t.is(error.code, 'EINVALIDNEXTVERSION');
  t.is(error.name, 'SemanticReleaseError');
});

test.serial('Throws "EINVALIDLTSMERGE" if merge an out of range release in a lts branch', async t => {
  const repositoryUrl = await gitRepo(true);
  const commits = await gitCommits(['First']);
  await gitTagVersion('v1.0.0');
  await gitTagVersion('v1.0.0@1.1.x');
  commits.push(...(await gitCommits(['Second'])));
  await gitTagVersion('v1.1.0');
  await gitTagVersion('v1.1.0@1.1.x');
  await gitCheckout('1.1.x');
  await push('origin', '1.1.x');
  await gitCheckout('master', false);
  commits.push(...(await gitCommits(['Third'])));
  await gitTagVersion('v1.1.1');
  commits.push(...(await gitCommits(['Fourth'])));
  await gitTagVersion('v1.2.0');
  await push('origin');
  await gitCheckout('1.1.x', false);
  await merge('master');
  await push('origin', '1.1.x');

  const notes = 'Release notes';
  const verifyConditions = stub().resolves();
  const analyzeCommits = stub().resolves();
  const verifyRelease = stub().resolves();
  const generateNotes = stub().resolves(notes);
  const addChannel = stub().resolves();
  const prepare = stub().resolves();
  const publish = stub().resolves();
  const success = stub().resolves();
  const fail = stub().resolves();

  const config = {branches: [{name: 'master'}, {name: '1.1.x'}], repositoryUrl, tagFormat: `v\${version}`};
  const options = {
    ...config,
    verifyConditions,
    analyzeCommits,
    verifyRelease,
    addChannel,
    generateNotes,
    prepare,
    publish,
    success,
    fail,
  };

  const nextRelease = {
    type: 'patch',
    version: '1.1.1',
    channel: '1.1.x',
    gitTag: 'v1.1.1@1.1.x',
    name: 'v1.1.1',
    gitHead: commits[2].hash,
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: '1.1.x', isPr: false}),
  });
  const errors = [...(await t.throws(semanticRelease(options)))];

  t.is(addChannel.callCount, 1);
  t.deepEqual(addChannel.args[0][1].nextRelease, {...nextRelease, notes});

  t.is(publish.callCount, 0);

  t.is(success.callCount, 1);
  t.deepEqual(success.args[0][1].releases, [{...nextRelease, notes, pluginName: '[Function: proxy]'}]);

  t.is(fail.callCount, 1);
  t.deepEqual(fail.args[0][1].errors, errors);

  t.is(errors[0].code, 'EINVALIDLTSMERGE');
  t.is(errors[0].name, 'SemanticReleaseError');
});

test.serial('Returns falsy value if triggered on an outdated clone', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  const repoDir = process.cwd();
  // Add commits to the master branch
  await gitCommits(['First']);
  await gitCommits(['Second']);
  await push();
  await gitShallowClone(repositoryUrl);
  await gitCommits(['Third']);
  await push();
  process.chdir(repoDir);

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });

  t.falsy(await semanticRelease({repositoryUrl}));
  t.deepEqual(t.context.log.args[t.context.log.args.length - 1], [
    "The local branch %s is behind the remote one, therefore a new version won't be published.",
    'master',
  ]);
});

test.serial('Returns falsy value if not running from the configured branch', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  const options = {
    branch: 'master',
    repositoryUrl,
    verifyConditions: stub().resolves(),
    analyzeCommits: stub().resolves(),
    verifyRelease: stub().resolves(),
    generateNotes: stub().resolves(),
    addChannel: stub().resolves(),
    prepare: stub().resolves(),
    publish: stub().resolves(),
    success: stub().resolves(),
    fail: stub().resolves(),
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'other-branch', isPr: false}),
  });

  t.falsy(await semanticRelease(options));
  t.is(
    t.context.log.args[1][0],
    'This test run was triggered on the branch other-branch, while semantic-release is configured to only publish from master, therefore a new version won’t be published.'
  );
});

test.serial('Returns falsy value if there is no relevant changes', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  await gitCommits(['First']);
  await push();

  const analyzeCommits = stub().resolves();
  const verifyRelease = stub().resolves();
  const generateNotes = stub().resolves();
  const publish = stub().resolves();

  const options = {
    branch: 'master',
    repositoryUrl,
    verifyConditions: [stub().resolves()],
    analyzeCommits,
    verifyRelease,
    generateNotes,
    addChannel: stub().resolves(),
    prepare: stub().resolves(),
    publish,
    success: stub().resolves(),
    fail: stub().resolves(),
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });

  t.falsy(await semanticRelease(options));
  t.is(analyzeCommits.callCount, 1);
  t.is(verifyRelease.callCount, 0);
  t.is(generateNotes.callCount, 0);
  t.is(publish.callCount, 0);
  t.is(
    t.context.log.args[t.context.log.args.length - 1][0],
    'There are no relevant changes, so no new version is released.'
  );
});

test.serial('Exclude commits with [skip release] or [release skip] from analysis', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  const commits = await gitCommits([
    'Test commit',
    'Test commit [skip release]',
    'Test commit [release skip]',
    'Test commit [Release Skip]',
    'Test commit [Skip Release]',
    'Test commit [skip    release]',
    'Test commit\n\n commit body\n[skip release]',
    'Test commit\n\n commit body\n[release skip]',
  ]);
  await push();
  const analyzeCommits = stub().resolves();
  const config = {branch: 'master', repositoryUrl, globalOpt: 'global'};
  const options = {
    ...config,
    verifyConditions: [stub().resolves(), stub().resolves()],
    analyzeCommits,
    verifyRelease: stub().resolves(),
    generateNotes: stub().resolves(),
    addChannel: stub().resolves(),
    prepare: stub().resolves(),
    publish: stub().resolves(),
    success: stub().resolves(),
    fail: stub().resolves(),
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  await semanticRelease(options);

  t.is(analyzeCommits.callCount, 1);

  t.is(analyzeCommits.args[0][1].commits.length, 2);
  t.deepEqual(analyzeCommits.args[0][1].commits[0], commits[commits.length - 1]);
});

test.serial('Hide sensitive environment variable values from the logs', async t => {
  process.env.MY_TOKEN = 'secret token';
  const repositoryUrl = await gitRepo(true);

  const options = {
    branch: 'master',
    repositoryUrl,
    verifyConditions: async (pluginConfig, {logger}) => {
      console.log(`Console: The token ${process.env.MY_TOKEN} is invalid`);
      logger.log(`Log: The token ${process.env.MY_TOKEN} is invalid`);
      logger.error(`Error: The token ${process.env.MY_TOKEN} is invalid`);
      throw new Error(`Invalid token ${process.env.MY_TOKEN}`);
    },
  };
  const semanticRelease = proxyquire('..', {
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });

  await t.throws(semanticRelease(options));

  t.regex(t.context.stdout.args[t.context.stdout.args.length - 2][0], /Console: The token \[secure\] is invalid/);
  t.regex(t.context.stdout.args[t.context.stdout.args.length - 1][0], /Log: The token \[secure\] is invalid/);
  t.regex(t.context.stderr.args[0][0], /Error: The token \[secure\] is invalid/);
  t.regex(t.context.stderr.args[1][0], /Invalid token \[secure\]/);
});

test.serial('Log both plugins errors and errors thrown by "fail" plugin', async t => {
  process.env.MY_TOKEN = 'secret token';
  const repositoryUrl = await gitRepo(true);
  const pluginError = new SemanticReleaseError('Plugin error', 'ERR');
  const failError1 = new Error('Fail error 1');
  const failError2 = new Error('Fail error 2');

  const options = {
    branch: 'master',
    repositoryUrl,
    verifyConditions: stub().rejects(pluginError),
    fail: [stub().rejects(failError1), stub().rejects(failError2)],
  };
  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });

  await t.throws(semanticRelease(options));

  t.is(t.context.error.args[t.context.error.args.length - 2][1], failError1);
  t.is(t.context.error.args[t.context.error.args.length - 1][1], failError2);
  t.deepEqual(t.context.log.args[t.context.log.args.length - 1], ['%s Plugin error', 'ERR']);
});

test.serial('Call "fail" only if a plugin returns a SemanticReleaseError', async t => {
  process.env.MY_TOKEN = 'secret token';
  const repositoryUrl = await gitRepo(true);
  const pluginError = new Error('Plugin error');
  const fail = stub().resolves();

  const options = {
    branch: 'master',
    repositoryUrl,
    verifyConditions: stub().rejects(pluginError),
    fail,
  };
  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });

  await t.throws(semanticRelease(options));

  t.true(fail.notCalled);
  t.is(t.context.error.args[t.context.error.args.length - 1][1], pluginError);
});

test.serial('Throw SemanticReleaseError if repositoryUrl is not set and cannot be found from repo config', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  const errors = [...(await t.throws(semanticRelease()))];

  // Verify error code and type
  t.is(errors[0].code, 'ENOREPOURL');
  t.is(errors[0].name, 'SemanticReleaseError');
});

test.serial('Throw an Error if plugin returns an unexpected value', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  const repositoryUrl = await gitRepo(true);
  // Add commits to the master branch
  await gitCommits(['First']);
  // Create the tag corresponding to version 1.0.0
  await gitTagVersion('v1.0.0');
  // Add new commits to the master branch
  await gitCommits(['Second']);
  await push();

  const verifyConditions = stub().resolves();
  const analyzeCommits = stub().resolves('string');

  const options = {
    branch: 'master',
    repositoryUrl,
    verifyConditions: [verifyConditions],
    analyzeCommits,
    success: stub().resolves(),
    fail: stub().resolves(),
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  const error = await t.throws(semanticRelease(options), Error);

  // Verify error message
  t.regex(error.message, new RegExp(DEFINITIONS.analyzeCommits.output.message));
  t.regex(error.details, /string/);
});

test.serial('Get all commits including the ones not in the shallow clone', async t => {
  const repositoryUrl = await gitRepo(true);
  await gitTagVersion('v1.0.0');
  await gitCommits(['First', 'Second', 'Third']);
  await push(repositoryUrl, 'master');

  await gitShallowClone(repositoryUrl);

  const nextRelease = {
    name: 'v2.0.0',
    type: 'major',
    version: '2.0.0',
    gitHead: await getGitHead(),
    gitTag: 'v2.0.0',
    channel: undefined,
  };
  const notes = 'Release notes';
  const analyzeCommits = stub().resolves(nextRelease.type);

  const config = {branch: 'master', repositoryUrl, globalOpt: 'global'};
  const options = {
    ...config,
    verifyConditions: stub().resolves(),
    analyzeCommits,
    verifyRelease: stub().resolves(),
    generateNotes: stub().resolves(notes),
    prepare: stub().resolves(),
    publish: stub().resolves(),
    success: stub().resolves(),
    fail: stub().resolves(),
  };

  const semanticRelease = proxyquire('..', {
    './lib/logger': t.context.logger,
    'env-ci': () => ({isCi: true, branch: 'master', isPr: false}),
  });
  t.truthy(await semanticRelease(options));

  t.is(analyzeCommits.args[0][1].commits.length, 3);
});
