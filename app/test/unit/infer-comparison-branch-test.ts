import { inferComparisonBranch } from '../../src/lib/stores/helpers/infer-comparison-branch'
import { Branch, BranchType } from '../../src/models/branch'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'
import { PullRequest, PullRequestRef } from '../../src/models/pull-request'
import { Repository } from '../../src/models/repository'
import { IRemote } from '../../src/models/remote'
import { ComparisonCache } from '../../src/lib/comparison-cache'

function createTestBranch(
  name: string,
  sha: string,
  remote: string | null = null
) {
  const shortSha = sha.slice(0, 7)
  const lastCommitDate = new Date()

  return new Branch(
    name,
    remote,
    sha,
    shortSha,
    lastCommitDate,
    BranchType.Local
  )
}

function createTestGhRepo(
  owner: string,
  defaultBranch: string | null = null,
  parent: GitHubRepository | null = null
) {
  if (owner.indexOf('/') !== -1) {
    throw new Error(
      'Providing a slash in the repository name is no longer supported, please update your test'
    )
  }

  const cloneURL = `https://github.com/${owner}/my-cool-repo.git`

  return new GitHubRepository(
    name,
    new Owner('', '', null),
    null,
    false,
    '',
    `${
      defaultBranch !== null && defaultBranch.indexOf('/') !== -1
        ? defaultBranch.split('/')[1]
        : defaultBranch
    }`,
    cloneURL,
    parent
  )
}

function createTestPrRef(
  branch: Branch,
  ghRepo: GitHubRepository | null = null
) {
  return new PullRequestRef(branch.name, branch.sha, ghRepo)
}

function createTestPr(head: PullRequestRef, base: PullRequestRef) {
  return new PullRequest(-1, new Date(), '', 1, head, base, '')
}

function createTestRepo(ghRepo: GitHubRepository | null = null) {
  return new Repository('', -1, ghRepo, false)
}

function mockGetRemotes(repo: Repository): Promise<ReadonlyArray<IRemote>> {
  return Promise.resolve([])
}

describe('inferComparisonBranch', () => {
  const branches = [
    createTestBranch('master', '0', 'origin'),
    createTestBranch('dev', '1', 'origin'),
    createTestBranch('staging', '2', 'origin'),
    createTestBranch('default', '3', 'origin'),
    createTestBranch('head', '4', 'origin'),
    createTestBranch('upstream/base', '5', 'upstream'),
    createTestBranch('fork', '6', 'origin'),
  ]
  const comparisonCache = new ComparisonCache()

  beforeEach(() => {
    comparisonCache.clear()
  })

  it('Returns the master branch when given unhosted repo', async () => {
    const repo = createTestRepo()
    const branch = await inferComparisonBranch(
      repo,
      branches,
      null,
      null,
      mockGetRemotes,
      comparisonCache
    )

    expect(branch).not.toBeNull()
    expect(branch!.sha).toBe('0')
  })

  it('Returns the default branch of a GitHub repository', async () => {
    const ghRepo: GitHubRepository = createTestGhRepo('test', 'default')
    const repo = createTestRepo(ghRepo)

    const branch = await inferComparisonBranch(
      repo,
      branches,
      null,
      null,
      mockGetRemotes,
      comparisonCache
    )

    expect(branch).not.toBeNull()
    expect(branch!.name).toBe('default')
  })

  it('Returns the branch associated with the PR', async () => {
    const ghRepo: GitHubRepository = createTestGhRepo('test', 'default')
    const repo = createTestRepo(ghRepo)
    const head = createTestPrRef(branches[4])
    const base = createTestPrRef(branches[5])
    const pr: PullRequest = createTestPr(head, base)

    const branch = await inferComparisonBranch(
      repo,
      branches,
      pr,
      null,
      mockGetRemotes,
      comparisonCache
    )

    expect(branch).not.toBeNull()
    expect(branch!.upstream).toBe(branches[5].upstream)
  })

  it('Returns the default branch of the fork if it is ahead of the current branch', async () => {
    const currentBranch = branches[3]
    const defaultBranch = branches[6]
    const parent = createTestGhRepo('parent', 'parent')
    const fork = createTestGhRepo('fork', 'fork', parent)
    const repo = createTestRepo(fork)

    comparisonCache.set(currentBranch.sha, defaultBranch.sha, {
      ahead: 1,
      behind: 0,
    })

    const branch = await inferComparisonBranch(
      repo,
      branches,
      null,
      currentBranch,
      mockGetRemotes,
      comparisonCache
    )

    expect(branch).not.toBeNull()
    expect(branch!.name).toBe(defaultBranch.name)
  })

  it("Returns the default branch of the fork's parent branch if the fork is not ahead of the current branch", async () => {
    const defaultBranchOfParent = branches[5]
    const defaultBranchOfFork = branches[4]
    const parent = createTestGhRepo(
      'parent',
      defaultBranchOfParent.nameWithoutRemote
    )
    const fork = createTestGhRepo('fork', defaultBranchOfFork.name, parent)
    const repo = createTestRepo(fork)
    const mockGetRemotes = (repo: Repository) => {
      const remotes: ReadonlyArray<IRemote> = [
        { name: 'origin', url: fork.cloneURL! },
        { name: 'upstream', url: parent.cloneURL! },
      ]

      return Promise.resolve(remotes)
    }

    comparisonCache.set(defaultBranchOfParent.sha, defaultBranchOfFork.sha, {
      ahead: 0,
      behind: 0,
    })

    const branch = await inferComparisonBranch(
      repo,
      branches,
      null,
      defaultBranchOfParent,
      mockGetRemotes,
      comparisonCache
    )

    expect(branch).not.toBeNull()
    expect(branch!.upstream).toBe(defaultBranchOfParent.upstream)
  })
})
