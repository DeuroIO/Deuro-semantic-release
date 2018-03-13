const semver = require('semver');
const {FIRST_RELEASE} = require('./definitions/constants');

module.exports = (branch, type, lastRelease, logger) => {
  let version;
  if (lastRelease.version) {
    version =
      branch.type === 'prerelease'
        ? semver.prerelease(lastRelease.version)
          ? semver.inc(lastRelease.version, 'prerelease')
          : `${semver.inc(lastRelease.version, type)}-${branch.prerelease}.0`
        : semver.inc(lastRelease.version, type);
    logger.log('The next release version is %s', version);
  } else {
    version = branch.type === 'prerelease' ? `${FIRST_RELEASE}-${branch.prerelease}.0` : FIRST_RELEASE;
    logger.log('There is no previous release, the next release version is %s', version);
  }

  return version;
};
