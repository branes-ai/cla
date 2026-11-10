// Re-runs the CLA check on pull requests.
//   rerunForPr: one pull request (a "recheck" comment; uses the repository's GITHUB_TOKEN).
//   rerunAllFailed: every open pull request in the org whose latest CLA check failed
//                   (after a signature or allowlist change; uses the rechecker app token).
"use strict";

const WORKFLOW_PATH = ".github/workflows/cla.yml";

async function latestClaRun(github, owner, repo, sha) {
  const { data } = await github.rest.actions.listWorkflowRunsForRepo(
    { owner, repo, head_sha: sha, event: "pull_request_target", per_page: 50 });
  return data.workflow_runs
    .filter((r) => r.path && r.path.split("@")[0] === WORKFLOW_PATH)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
}

async function rerunForPr(github, owner, repo, number, core) {
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: number });
  const run = await latestClaRun(github, owner, repo, pr.head.sha);
  if (!run) return core.info("No CLA run found for this pull request yet.");
  if (run.status !== "completed") return core.info("The CLA check is already running.");
  await github.rest.actions.reRunWorkflow({ owner, repo, run_id: run.id });
  core.info("CLA check re-run started.");
}

async function rerunAllFailed(github, org, core) {
  const prs = await github.paginate("GET /search/issues",
    { q: `org:${org} is:pr is:open`, per_page: 100 });
  let n = 0;
  for (const item of prs) {
    const [owner, repo] = item.repository_url.split("/").slice(-2);
    try {
      const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: item.number });
      const run = await latestClaRun(github, owner, repo, pr.head.sha);
      if (run && run.status === "completed" && run.conclusion === "failure") {
        await github.rest.actions.reRunWorkflow({ owner, repo, run_id: run.id });
        n++;
      }
    } catch (e) {
      core.warning(`Skipped one pull request: ${e.status || ""} ${e.message}`);
    }
  }
  core.info(`Re-ran the CLA check on ${n} pull request(s).`);
  return n;
}

module.exports = { rerunForPr, rerunAllFailed };
