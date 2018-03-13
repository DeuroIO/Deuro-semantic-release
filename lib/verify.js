const {template, isString, isPlainObject} = require('lodash');
const pReduce = require('p-reduce');
const AggregateError = require('aggregate-error');
const {isGitRepo, verifyTagName, verifyBranchName} = require('./git');
const getError = require('./get-error');

module.exports = async options => {
  const errors = [];

  if (!(await isGitRepo())) {
    errors.push(getError('ENOGITREPO'));
  } else if (!options.repositoryUrl) {
    errors.push(getError('ENOREPOURL'));
  }

  // Verify that compiling the `tagFormat` produce a valid Git tag
  if (!(await verifyTagName(template(options.tagFormat)({version: '0.0.0'})))) {
    errors.push(getError('EINVALIDTAGFORMAT', {tagFormat: options.tagFormat}));
  }

  // Verify the `tagFormat` contains the variable `version` by compiling the `tagFormat` template
  // with a space as the `version` value and verify the result contains the space.
  // The space is used as it's an invalid tag character, so it's guaranteed to no be present in the `tagFormat`.
  if ((template(options.tagFormat)({version: ' '}).match(/ /g) || []).length !== 1) {
    errors.push(getError('ETAGNOVERSION', {tagFormat: options.tagFormat}));
  }

  options.branches.forEach(branch => {
    if (!isPlainObject(branch) || !isString(branch.name) || !branch.name.trim()) {
      errors.push(getError('EINVALIDBRANCH', {branch}));
    }
  });

  const duplicates = [...options.branches]
    .filter(Boolean) // Filter out falsy branch
    .map(({name}) => name)
    .filter(Boolean) // Filter out falsy branch names
    .sort()
    .filter((val, idx, arr) => arr[idx] === arr[idx + 1] && arr[idx] !== arr[idx - 1]);

  if (duplicates.length > 0) {
    errors.push(getError('EDUPLICATEBRANCHES', {duplicates}));
  }

  await pReduce(options.branches, async (_, branch) => {
    if (branch && isString(branch.name) && branch.name.trim() && !(await verifyBranchName(branch.name))) {
      errors.push(getError('EINVALIDBRANCHNAME', {name: branch.name}));
    }
  });

  if (errors.length > 0) {
    throw new AggregateError(errors);
  }
};
