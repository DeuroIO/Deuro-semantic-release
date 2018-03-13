const {differenceBy} = require('lodash');
const AggregateError = require('aggregate-error');
const DEFINITIONS = require('../definitions/branches');
const getError = require('../get-error');
const verify = require('./verify');
const normalize = require('./normalize');

module.exports = async branches => {
  await verify(branches);

  const errors = [];
  const branchesByType = Object.entries(DEFINITIONS).reduce(
    (branchesByType, [type, {filter}]) => ({[type]: branches.filter(filter), ...branchesByType}),
    {}
  );

  const result = Object.entries(DEFINITIONS).reduce((result, [type, {config: {validator, error}}]) => {
    const branchesOfType = normalize[type](branchesByType);

    if (!validator(branchesOfType)) {
      errors.push(getError(error, {branches: branchesOfType}));
    }

    return [...result, ...branchesOfType];
  }, []);

  const unknowns = differenceBy(branches, result, 'name');
  if (unknowns.length > 0) {
    errors.push(getError('EUNKNOWNBRANCH', {unknowns}));
  }

  if (errors.length > 0) {
    throw new AggregateError(errors);
  }

  return result;
};
