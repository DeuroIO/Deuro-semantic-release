const {isFunction, union, template} = require('lodash');
const semver = require('semver');

function extractErrors(err) {
  return err && isFunction(err[Symbol.iterator]) ? [...err] : [err];
}

function tagsToVersions(tags) {
  return tags.map(({version}) => version);
}

function isMajorRange(range) {
  return /^\d\.x(?:\.x)?$/i.test(range);
}

function getUpperBound(range) {
  return semver.valid(range) ? range : ((semver.validRange(range) || '').match(/<(\d\.\d\.\d)$/) || [])[1];
}

function getLowerBound(range) {
  return ((semver.validRange(range) || '').match(/(\d\.\d\.\d)/) || [])[1];
}

function highest(version1, version2) {
  return version1 && version2 ? (semver.gt(version1, version2) ? version1 : version2) : version1 || version2;
}

function lowest(version1, version2) {
  return version1 && version2 ? (semver.lt(version1, version2) ? version1 : version2) : version1 || version2;
}

function getLatestVersion(versions, {prerelease = false} = {}) {
  return versions.filter(version => prerelease === true || !semver.prerelease(version)).sort(semver.rcompare)[0];
}

function getEarliestVersion(versions, {prerelease = false} = {}) {
  return versions.filter(version => prerelease === true || !semver.prerelease(version)).sort(semver.compare)[0];
}

function getFirstVersion(versions, lowerBranches) {
  const lowerVersion = union(...lowerBranches.map(({tags}) => tagsToVersions(tags))).sort(semver.rcompare);
  if (lowerVersion[0]) {
    return versions.sort(semver.compare).find(version => semver.gt(version, lowerVersion[0]));
  }
  return getEarliestVersion(versions);
}

function getRange(min, max) {
  return `>=${min}${max ? ` <${max}` : ''}`;
}

function makeTag(tagFormat, version, channel) {
  return template(tagFormat)({version: `${version}${channel ? `@${channel}` : ''}`});
}

module.exports = {
  extractErrors,
  tagsToVersions,
  isMajorRange,
  getUpperBound,
  getLowerBound,
  highest,
  lowest,
  getLatestVersion,
  getEarliestVersion,
  getFirstVersion,
  getRange,
  makeTag,
};
