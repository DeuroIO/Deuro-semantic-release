import {format} from 'util';
import test from 'ava';
import {writeFile, outputJson} from 'fs-extra';
import {omit} from 'lodash';
import proxyquire from 'proxyquire';
import {stub} from 'sinon';
import yaml from 'js-yaml';
import {gitRepo, gitTagVersion, gitCommits, gitShallowClone, gitAddConfig} from './helpers/git-utils';

// Save the current process.env
const envBackup = Object.assign({}, process.env);
// Save the current working diretory
const cwd = process.cwd();

test.beforeEach(t => {
  delete process.env.GIT_CREDENTIALS;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GL_TOKEN;
  delete process.env.GITLAB_TOKEN;
  // Delete environment variables that could have been set on the machine running the tests
  t.context.plugins = stub().returns({});
  t.context.getConfig = proxyquire('../lib/get-config', {'./plugins': t.context.plugins});
});

test.afterEach.always(() => {
  // Restore process.env
  process.env = envBackup;
  // Restore the current working directory
  process.chdir(cwd);
});

test.serial('Default values, reading repositoryUrl from package.json', async t => {
  const pkg = {repository: 'https://host.null/owner/package.git'};
  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  const commits = await gitCommits(['First']);
  await gitTagVersion('v1.0.0');
  await gitTagVersion('v1.1.0');
  // Add remote.origin.url config
  await gitAddConfig('remote.origin.url', 'git@host.null:owner/repo.git');
  // Create package.json in repository root
  await outputJson('./package.json', pkg);

  const {options} = await t.context.getConfig();

  // Verify the default options are set
  t.deepEqual(options.branches, [
    {
      channel: undefined,
      tags: [
        {channel: undefined, gitTag: 'v1.0.0', version: '1.0.0', gitHead: commits[0].hash},
        {channel: undefined, gitTag: 'v1.1.0', version: '1.1.0', gitHead: commits[0].hash},
      ],
      type: 'release',
      name: 'master',
      range: '>=1.1.0',
    },
  ]);
  t.is(options.repositoryUrl, 'https://host.null/owner/package.git');
  t.is(options.tagFormat, `v\${version}`);
});

test.serial('Default values, reading repositoryUrl from repo if not set in package.json', async t => {
  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Add remote.origin.url config
  await gitAddConfig('remote.origin.url', 'https://host.null/owner/module.git');

  const {options} = await t.context.getConfig();

  // Verify the default options are set
  t.deepEqual(options.branches, [{channel: undefined, tags: [], type: 'release', name: 'master', range: '>=1.0.0'}]);
  t.is(options.repositoryUrl, 'https://host.null/owner/module.git');
  t.is(options.tagFormat, `v\${version}`);
});

test.serial('Default values, reading repositoryUrl (http url) from package.json if not set in repo', async t => {
  const pkg = {repository: 'https://host.null/owner/module.git'};
  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json in repository root
  await outputJson('./package.json', pkg);

  const {options} = await t.context.getConfig();

  // Verify the default options are set
  t.deepEqual(options.branches, [{channel: undefined, tags: [], type: 'release', name: 'master', range: '>=1.0.0'}]);
  t.is(options.repositoryUrl, 'https://host.null/owner/module.git');
  t.is(options.tagFormat, `v\${version}`);
});

test.serial('Read options from package.json', async t => {
  const release = {
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_param'},
    generateNotes: 'generateNotes',
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json in repository root
  await outputJson('./package.json', {release});

  const {options} = await t.context.getConfig();

  const expected = {
    ...release,
    branch: 'test_branch',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'test_branch', range: '>=1.0.0'}],
  };

  // Verify the options contains the plugin config from package.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from package.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
});

test.serial('Read options from .releaserc.yml', async t => {
  const release = {
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_param'},
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json in repository root
  await writeFile('.releaserc.yml', yaml.safeDump(release));

  const {options} = await t.context.getConfig();

  const expected = {
    ...release,
    branch: 'test_branch',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'test_branch', range: '>=1.0.0'}],
  };
  // Verify the options contains the plugin config from package.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from package.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
});

test.serial('Read options from .releaserc.json', async t => {
  const release = {
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_param'},
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json in repository root
  await outputJson('.releaserc.json', release);

  const {options} = await t.context.getConfig();

  const expected = {
    ...release,
    branch: 'test_branch',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'test_branch', range: '>=1.0.0'}],
  };
  // Verify the options contains the plugin config from package.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from package.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
});

test.serial('Read options from .releaserc.js', async t => {
  const release = {
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_param'},
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json in repository root
  await writeFile('.releaserc.js', `module.exports = ${JSON.stringify(release)}`);

  const {options} = await t.context.getConfig();

  const expected = {
    ...release,
    branch: 'test_branch',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'test_branch', range: '>=1.0.0'}],
  };
  // Verify the options contains the plugin config from package.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from package.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
});

test.serial('Read options from release.config.js', async t => {
  const release = {
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_param'},
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json in repository root
  await writeFile('release.config.js', `module.exports = ${JSON.stringify(release)}`);

  const {options} = await t.context.getConfig();

  const expected = {
    ...release,
    branch: 'test_branch',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'test_branch', range: '>=1.0.0'}],
  };
  // Verify the options contains the plugin config from package.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from package.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
});

test.serial('Prioritise CLI/API parameters over file configuration and git repo', async t => {
  const release = {
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_pkg'},
    branches: ['branch_pkg'],
  };
  const options = {
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_cli'},
    branches: ['branch_cli'],
    repositoryUrl: 'http://cli-url.com/owner/package',
    tagFormat: `cli\${version}`,
  };
  const pkg = {release, repository: 'git@host.null:owner/module.git'};
  // Create a git repository, set the current working directory at the root of the repo
  const repo = await gitRepo();
  await gitCommits(['First']);
  // Create a clone
  await gitShallowClone(repo);
  // Create package.json in repository root
  await outputJson('./package.json', pkg);

  const result = await t.context.getConfig(options);

  const expected = {
    ...options,
    branch: 'branch_cli',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'branch_cli', range: '>=1.0.0'}],
  };
  // Verify the options contains the plugin config from CLI/API
  t.deepEqual(result.options, expected);
  // Verify the plugins module is called with the plugin options from CLI/API
  t.deepEqual(t.context.plugins.args[0][0], expected);
});

test.serial('Read configuration from file path in "extends"', async t => {
  const release = {extends: './shareable.json'};
  const shareable = {
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_param'},
    generateNotes: 'generateNotes',
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json and shareable.json in repository root
  await outputJson('./package.json', {release});
  await outputJson('./shareable.json', shareable);

  const {options} = await t.context.getConfig();

  const expected = {
    ...shareable,
    branch: 'test_branch',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'test_branch', range: '>=1.0.0'}],
  };
  // Verify the options contains the plugin config from shareable.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from shareable.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
  t.deepEqual(t.context.plugins.args[0][1], {
    analyzeCommits: './shareable.json',
    generateNotes: './shareable.json',
  });
});

test.serial('Read configuration from module path in "extends"', async t => {
  const release = {extends: 'shareable'};
  const shareable = {
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_param'},
    generateNotes: 'generateNotes',
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json and shareable.json in repository root
  await outputJson('./package.json', {release});
  await outputJson('./node_modules/shareable/index.json', shareable);

  const {options} = await t.context.getConfig();

  const expected = {
    ...shareable,
    branch: 'test_branch',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'test_branch', range: '>=1.0.0'}],
  };
  // Verify the options contains the plugin config from shareable.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from shareable.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
  t.deepEqual(t.context.plugins.args[0][1], {
    analyzeCommits: 'shareable',
    generateNotes: 'shareable',
  });
});

test.serial('Read configuration from an array of paths in "extends"', async t => {
  const release = {extends: ['./shareable1.json', './shareable2.json']};
  const shareable1 = {
    verifyRelease: 'verifyRelease1',
    analyzeCommits: {path: 'analyzeCommits1', param: 'analyzeCommits_param1'},
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
  };

  const shareable2 = {
    verifyRelease: 'verifyRelease2',
    generateNotes: 'generateNotes2',
    analyzeCommits: {path: 'analyzeCommits2', param: 'analyzeCommits_param2'},
    branches: ['test_branch'],
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json and shareable.json in repository root
  await outputJson('./package.json', {release});
  await outputJson('./shareable1.json', shareable1);
  await outputJson('./shareable2.json', shareable2);

  const {options} = await t.context.getConfig();

  const expected = {
    ...shareable1,
    ...shareable2,
    branch: 'test_branch',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'test_branch', range: '>=1.0.0'}],
  };
  // Verify the options contains the plugin config from shareable1.json and shareable2.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from shareable1.json and shareable2.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
  t.deepEqual(t.context.plugins.args[0][1], {
    verifyRelease1: './shareable1.json',
    verifyRelease2: './shareable2.json',
    generateNotes2: './shareable2.json',
    analyzeCommits1: './shareable1.json',
    analyzeCommits2: './shareable2.json',
  });
});

test.serial('Prioritize configuration from config file over "extends"', async t => {
  const release = {
    extends: './shareable.json',
    branches: ['test_pkg'],
    generateNotes: 'generateNotes',
    publish: [{path: 'publishPkg', param: 'publishPkg_param'}],
  };
  const shareable = {
    analyzeCommits: 'analyzeCommits',
    generateNotes: 'generateNotesShareable',
    publish: [{path: 'publishShareable', param: 'publishShareable_param'}],
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json and shareable.json in repository root
  await outputJson('./package.json', {release});
  await outputJson('./shareable.json', shareable);

  const {options} = await t.context.getConfig();

  const expected = omit(
    {
      ...shareable,
      ...release,
      branch: 'test_pkg',
      branches: [{channel: undefined, tags: [], type: 'release', name: 'test_pkg', range: '>=1.0.0'}],
    },
    'extends'
  );
  // Verify the options contains the plugin config from package.json and shareable.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from package.json and shareable.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
  t.deepEqual(t.context.plugins.args[0][1], {
    analyzeCommits: './shareable.json',
    generateNotesShareable: './shareable.json',
    publishShareable: './shareable.json',
  });
});

test.serial('Prioritize configuration from cli/API options over "extends"', async t => {
  const opts = {
    extends: './shareable2.json',
    branches: ['branch_opts'],
    publish: [{path: 'publishOpts', param: 'publishOpts_param'}],
    repositoryUrl: 'https://host.null/owner/module.git',
  };
  const release = {
    extends: './shareable1.json',
    branches: ['branch_pkg'],
    generateNotes: 'generateNotes',
    publish: [{path: 'publishPkg', param: 'publishPkg_param'}],
  };
  const shareable1 = {
    analyzeCommits: 'analyzeCommits1',
    generateNotes: 'generateNotesShareable1',
    publish: [{path: 'publishShareable', param: 'publishShareable_param1'}],
    branches: ['test_branch1'],
    repositoryUrl: 'https://host.null/owner/module.git',
  };
  const shareable2 = {
    analyzeCommits: 'analyzeCommits2',
    publish: [{path: 'publishShareable', param: 'publishShareable_param2'}],
    branches: ['test_branch2'],
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json, shareable1.json and shareable2.json in repository root
  await outputJson('./package.json', {release});
  await outputJson('./shareable1.json', shareable1);
  await outputJson('./shareable2.json', shareable2);

  const {options} = await t.context.getConfig(opts);

  const expected = omit(
    {
      ...shareable2,
      ...release,
      ...opts,
      branch: 'branch_opts',
      branches: [{channel: undefined, tags: [], type: 'release', name: 'branch_opts', range: '>=1.0.0'}],
    },
    'extends'
  );
  // Verify the options contains the plugin config from package.json and shareable2.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from package.json and shareable2.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
});

test.serial('Allow to unset properties defined in shareable config with "null"', async t => {
  const release = {
    extends: './shareable.json',
    analyzeCommits: null,
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
  };
  const shareable = {
    generateNotes: 'generateNotes',
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_param'},
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json and shareable.json in repository root
  await outputJson('./package.json', {release});
  await outputJson('./shareable.json', shareable);

  const {options} = await t.context.getConfig();

  const expected = {
    ...omit(shareable, 'analyzeCommits'),
    ...omit(release, ['extends', 'analyzeCommits']),
    branch: 'test_branch',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'test_branch', range: '>=1.0.0'}],
  };

  // Verify the options contains the plugin config from shareable.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from shareable.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
  t.deepEqual(t.context.plugins.args[0][1], {
    generateNotes: './shareable.json',
    analyzeCommits: './shareable.json',
  });
});

test.serial('Allow to unset properties defined in shareable config with "undefined"', async t => {
  const release = {
    extends: './shareable.json',
    analyzeCommits: undefined,
    branches: ['test_branch'],
    repositoryUrl: 'https://host.null/owner/module.git',
  };
  const shareable = {
    generateNotes: 'generateNotes',
    analyzeCommits: {path: 'analyzeCommits', param: 'analyzeCommits_param'},
    tagFormat: `v\${version}`,
  };

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json and release.config.js in repository root
  // await outputJson('./package.json', {release});
  await writeFile('release.config.js', `module.exports = ${format(release)}`);
  await outputJson('./shareable.json', shareable);

  const {options} = await t.context.getConfig();

  const expected = {
    ...omit(shareable, 'analyzeCommits'),
    ...omit(release, ['extends', 'analyzeCommits']),
    branch: 'test_branch',
    branches: [{channel: undefined, tags: [], type: 'release', name: 'test_branch', range: '>=1.0.0'}],
  };
  // Verify the options contains the plugin config from shareable.json
  t.deepEqual(options, expected);
  // Verify the plugins module is called with the plugin options from shareable.json
  t.deepEqual(t.context.plugins.args[0][0], expected);
  t.deepEqual(t.context.plugins.args[0][1], {
    generateNotes: './shareable.json',
    analyzeCommits: './shareable.json',
  });
});

test.serial('Throw an Error if one of the shareable config cannot be found', async t => {
  const release = {extends: ['./shareable1.json', 'non-existing-path']};
  const shareable = {analyzeCommits: 'analyzeCommits'};

  // Create a git repository, set the current working directory at the root of the repo
  await gitRepo();
  // Create package.json and shareable.json in repository root
  await outputJson('./package.json', {release});
  await outputJson('./shareable1.json', shareable);

  const error = await t.throws(t.context.getConfig(), Error);

  t.is(error.message, "Cannot find module 'non-existing-path'");
  t.is(error.code, 'MODULE_NOT_FOUND');
});
