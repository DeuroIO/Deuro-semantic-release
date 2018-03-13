import test from 'ava';
import tempy from 'tempy';
import verify from '../lib/verify';
import {gitRepo} from './helpers/git-utils';

// Save the current working diretory
const cwd = process.cwd();

test.afterEach.always(() => {
  // Restore the current working directory
  process.chdir(cwd);
});

test.serial('Throw a AggregateError', async t => {
  await gitRepo();

  const errors = [
    ...(await t.throws(verify({branches: [{name: 'master'}, {name: ''}, {name: 'master'}, {name: '~invalid'}]}))),
  ];

  t.is(errors[0].name, 'SemanticReleaseError');
  t.is(errors[0].code, 'ENOREPOURL');
  t.is(errors[1].name, 'SemanticReleaseError');
  t.is(errors[1].code, 'EINVALIDTAGFORMAT');
  t.is(errors[2].name, 'SemanticReleaseError');
  t.is(errors[2].code, 'ETAGNOVERSION');
  t.is(errors[3].name, 'SemanticReleaseError');
  t.is(errors[3].code, 'EINVALIDBRANCH');
  t.is(errors[4].name, 'SemanticReleaseError');
  t.is(errors[4].code, 'EDUPLICATEBRANCHES');
  t.is(errors[5].name, 'SemanticReleaseError');
  t.is(errors[5].code, 'EINVALIDBRANCHNAME');
});

test.serial('Throw a SemanticReleaseError if does not run on a git repository', async t => {
  const dir = tempy.directory();
  process.chdir(dir);

  const errors = [...(await t.throws(verify({branches: []})))];

  t.is(errors[0].name, 'SemanticReleaseError');
  t.is(errors[0].code, 'ENOGITREPO');
});

test.serial('Throw a SemanticReleaseError if the "tagFormat" is not valid', async t => {
  const repositoryUrl = await gitRepo(true);
  const options = {repositoryUrl, tagFormat: `?\${version}`, branches: []};

  const errors = [...(await t.throws(verify(options)))];

  t.is(errors[0].name, 'SemanticReleaseError');
  t.is(errors[0].code, 'EINVALIDTAGFORMAT');
});

test.serial('Throw a SemanticReleaseError if the "tagFormat" does not contains the "version" variable', async t => {
  const repositoryUrl = await gitRepo(true);
  const options = {repositoryUrl, tagFormat: 'test', branches: []};

  const errors = [...(await t.throws(verify(options)))];

  t.is(errors[0].name, 'SemanticReleaseError');
  t.is(errors[0].code, 'ETAGNOVERSION');
});

test.serial('Throw a SemanticReleaseError if the "tagFormat" contains multiple "version" variables', async t => {
  const repositoryUrl = await gitRepo(true);
  const options = {repositoryUrl, tagFormat: `\${version}v\${version}`, branches: []};

  const errors = [...(await t.throws(verify(options)))];

  t.is(errors[0].name, 'SemanticReleaseError');
  t.is(errors[0].code, 'ETAGNOVERSION');
});

test.serial('Throw a SemanticReleaseError for each invalid branch', async t => {
  const repositoryUrl = await gitRepo(true);
  const options = {repositoryUrl, tagFormat: `v\${version}`, branches: [{name: ''}, {name: '  '}, {name: 1}, 'master']};

  const errors = [...(await t.throws(verify(options)))];

  t.is(errors[0].name, 'SemanticReleaseError');
  t.is(errors[0].code, 'EINVALIDBRANCH');
  t.is(errors[1].name, 'SemanticReleaseError');
  t.is(errors[1].code, 'EINVALIDBRANCH');
  t.is(errors[2].name, 'SemanticReleaseError');
  t.is(errors[2].code, 'EINVALIDBRANCH');
  t.is(errors[3].name, 'SemanticReleaseError');
  t.is(errors[3].code, 'EINVALIDBRANCH');
});

test.serial('Throw a SemanticReleaseError if there is duplicate branches', async t => {
  const repositoryUrl = await gitRepo(true);
  const options = {repositoryUrl, tagFormat: `v\${version}`, branches: [{name: 'master'}, {name: 'master'}]};

  const errors = [...(await t.throws(verify(options)))];

  t.is(errors[0].name, 'SemanticReleaseError');
  t.is(errors[0].code, 'EDUPLICATEBRANCHES');
});

test.serial('Throw a SemanticReleaseError for each invalid branch name', async t => {
  const repositoryUrl = await gitRepo(true);
  const options = {repositoryUrl, tagFormat: `v\${version}`, branches: [{name: '~master'}, {name: '^master'}]};

  const errors = [...(await t.throws(verify(options)))];

  t.is(errors[0].name, 'SemanticReleaseError');
  t.is(errors[0].code, 'EINVALIDBRANCHNAME');
  t.is(errors[1].name, 'SemanticReleaseError');
  t.is(errors[1].code, 'EINVALIDBRANCHNAME');
});

test.serial('Return "true" if all verification pass', async t => {
  const repositoryUrl = await gitRepo(true);
  const options = {repositoryUrl, tagFormat: `v\${version}`, branches: [{name: 'master'}]};

  await t.notThrows(verify(options));
});
