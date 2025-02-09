import { Octokit } from '@octokit/action'

const OWNER = 'commaai'
const REPO = 'new-connect'

const octokit = new Octokit()

async function *fetchRecentArtifacts() {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  for await (const { data } of octokit.paginate.iterator(
    octokit.actions.listArtifactsForRepo,
    { owner: OWNER, repo: REPO, },
  )) {
    for (const artifact of data) {
      if (!artifact.updated_at) continue
      if (new Date(artifact.updated_at).getTime() < sixMonthsAgo.getTime()) break
      if (artifact.workflow_run?.head_branch !== 'master') continue
      if (artifact.expired) continue
      yield artifact
    }
  }
}

async function main() {
  for await (const artifact of fetchRecentArtifacts()) {
    console.debug(`Found artifact: ${artifact.name}`)
  }
}

main().catch(console.error)
