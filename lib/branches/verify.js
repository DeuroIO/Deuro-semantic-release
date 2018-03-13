const {isString, isPlainObject} = require('lodash');
const pReduce = require('p-reduce');
const AggregateError = require('aggregate-error');
const {verifyBranchName} = require('../git');
const getError = require('../get-error');

module.exports = async branches => {
  const errors = [];

  branches.forEach(branch => {
    if (!isPlainObject(branch) || !isString(branch.name) || !branch.name.trim()) {
      errors.push(getError('EINVALIDBRANCH', {branch}));
    }
  });

  const duplicates = [...branches]
    .filter(Boolean) // Filter out falsy branch
    .map(({name}) => name)
    .filter(Boolean) // Filter out falsy branch names
    .sort()
    .filter((val, idx, arr) => arr[idx] === arr[idx + 1] && arr[idx] !== arr[idx - 1]);

  if (duplicates.length > 0) {
    errors.push(getError('EDUPLICATEBRANCHES', {duplicates}));
  }

  await pReduce(branches, async (_, branch) => {
    if (branch && isString(branch.name) && branch.name.trim() && !(await verifyBranchName(branch.name))) {
      errors.push(getError('EINVALIDBRANCHNAME', {name: branch.name}));
    }
  });

  if (errors.length > 0) {
    throw new AggregateError(errors);
  }
};
