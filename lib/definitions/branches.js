const {isString, isUndefined, uniqBy} = require('lodash');
const semver = require('semver');

const isLtsRange = range => /^\d\.[\dx](?:\.x)?$/i.test(range);

module.exports = {
  lts: {
    filter: ({name, range, prerelease}) => (range ? isLtsRange(range) : isLtsRange(name)) && isUndefined(prerelease),
    config: {
      validator: branches => uniqBy(branches, ({range}) => semver.validRange(range)).length === branches.length,
      error: 'ELTSBRANCHES',
    },
  },
  release: {
    filter: ({name, range, prerelease}) => isUndefined(range) && isUndefined(prerelease) && !semver.validRange(name),
    config: {
      validator: branches => branches.length <= 3 && branches.length > 0,
      error: 'ERELEASEBRANCHES',
    },
  },
  prerelease: {
    filter: ({name, range, prerelease}) =>
      (isString(prerelease) || prerelease === true) && isUndefined(range) && !semver.validRange(name),
    config: {
      validator: branches => uniqBy(branches, 'prerelease').length === branches.length,
      error: 'EPRERELEASEBRANCHES',
    },
  },
};
