const execa = require('execa');
const debug = require('debug')('semantic-release:git');

/**
 * Get the commit sha for a given tag.
 *
 * @param {String} tagName Tag name for which to retrieve the commit sha.
 *
 * @return {String} The commit sha of the tag in parameter or `null`.
 */
async function gitTagHead(tagName) {
  try {
    return await execa.stdout('git', ['rev-list', '-1', tagName]);
  } catch (err) {
    debug(err);
  }
}

/**
 * @return {Array<String>} List of git tags.
 * @throws {Error} If the `git` command fails.
 */
async function gitTags() {
  return (await execa.stdout('git', ['tag']))
    .split('\n')
    .map(tag => tag.trim())
    .filter(tag => Boolean(tag));
}

/**
 * Verify if the `ref` is in the direct history of a given branch.
 *
 * @param {String} ref The reference to look for.
 * @param {String} branch The branch for which to check if the `ref` is in history.
 *
 * @return {Boolean} `true` if the reference is in the history of the current branch, falsy otherwise.
 */
async function isRefInHistory(ref, branch) {
  if (!(await isRefExists(branch))) {
    return false;
  }
  try {
    await execa('git', ['merge-base', '--is-ancestor', ref, branch]);
    return true;
  } catch (err) {
    if (err.code === 1) {
      return false;
    }

    debug(err);
    throw err;
  }
}

/**
 * Verify if the `ref` exits
 *
 * @param {String} ref The reference to verify.
 *
 * @return {Boolean} `true` if the reference exists, falsy otherwise.
 */
async function isRefExists(ref) {
  try {
    return (await execa('git', ['rev-parse', '--verify', ref])).code === 0;
  } catch (err) {
    debug(err);
  }
}

/**
 * Unshallow the git repository (retriving every commits and tags).
 *
 * @param {String} repositoryUrl The remote repository URL.
 */
async function unshallow(repositoryUrl) {
  await execa('git', ['fetch', '--unshallow', '--tags', repositoryUrl], {reject: false});
}

/**
 * @return {string} the sha of the HEAD commit.
 */
async function gitHead() {
  return execa.stdout('git', ['rev-parse', 'HEAD']);
}

/**
 * @return {string} The value of the remote git URL.
 */
async function repoUrl() {
  try {
    return await execa.stdout('git', ['config', '--get', 'remote.origin.url']);
  } catch (err) {
    debug(err);
  }
}

/**
 * @return {Boolean} `true` if the current working directory is in a git repository, falsy otherwise.
 */
async function isGitRepo() {
  try {
    return (await execa('git', ['rev-parse', '--git-dir'])).code === 0;
  } catch (err) {
    debug(err);
  }
}

/**
 * Verify the write access authorization to remote repository with push dry-run.
 *
 * @param {String} repositoryUrl The remote repository URL.
 * @param {String} branch The repositoru branch for which to verify write access.
 *
 * @throws {Error} if not authorized to push.
 */
async function verifyAuth(repositoryUrl, branch) {
  try {
    await execa('git', ['push', '--dry-run', repositoryUrl, `HEAD:${branch}`]);
  } catch (err) {
    debug(err);
    throw err;
  }
}

/**
 * Tag the commit head on the local repository.
 *
 * @param {String} tagName The name of the tag.
 * @param {String} ref The Git reference to tag.
 * @throws {Error} if the tag creation failed.
 */
async function tag(tagName, ref = 'HEAD') {
  await execa('git', ['tag', tagName, ref]);
}

/**
 * Push to the remote repository.
 *
 * @param {String} repositoryUrl The remote repository URL.
 * @param {String} branch The branch to push.
 * @throws {Error} if the push failed.
 */
async function push(repositoryUrl, branch) {
  await execa('git', ['push', '--tags', repositoryUrl, `HEAD:${branch}`]);
}

/**
 * Verify a tag name is a valid Git reference.
 *
 * @param {String} tag the tag name to verify.
 * @return {Boolean} `true` if valid, falsy otherwise.
 */
async function verifyTagName(tag) {
  try {
    return (await execa('git', ['check-ref-format', `refs/tags/${tag}`])).code === 0;
  } catch (err) {
    debug(err);
  }
}

/**
 * Verify a branch name is a valid Git reference.
 *
 * @param {String} branch the branch name to verify.
 * @return {Boolean} `true` if valid, falsy otherwise.
 */
async function verifyBranchName(branch) {
  try {
    return (await execa('git', ['check-ref-format', `refs/heads/${branch}`])).code === 0;
  } catch (err) {
    debug(err);
  }
}

/**
 * Verify the local branch is up to date with the remote one.
 *
 * @param {String} repositoryUrl The remote repository URL.
 * @param {String} branch The repository branch for which to verify status.
 *
 * @return {Boolean} `true` is the HEAD of the current local branch is the same as the HEAD of the remote branch, falsy otherwise.
 */
async function isBranchUpToDate(repositoryUrl, branch) {
  try {
    return await isRefInHistory(
      (await execa.stdout('git', ['ls-remote', '--heads', repositoryUrl, branch])).match(/^(\w+)?/)[1],
      branch
    );
  } catch (err) {
    debug(err);
  }
}

module.exports = {
  gitTagHead,
  gitTags,
  isRefInHistory,
  isRefExists,
  unshallow,
  gitHead,
  repoUrl,
  isGitRepo,
  verifyAuth,
  tag,
  push,
  verifyTagName,
  isBranchUpToDate,
  verifyBranchName,
};
