// Moves signing requests out of this public repository into the private
// branes-ai/cla-signatures repository (GitHub does not let apps delete issues).
// The issue and its edit history then exist only in the private repository.
"use strict";

const MARKER = "BRANES-CLA-ENCRYPTED-V1";

async function moveToPrivate(github, issueNodeId) {
  const { repository } = await github.graphql(
    "query { repository(owner: \"branes-ai\", name: \"cla-signatures\") { id } }");
  await github.graphql(
    "mutation($issue: ID!, $repo: ID!) { transferIssue(input: { issueId: $issue, repositoryId: $repo, createLabelsIfMissing: false }) { issue { number } } }",
    { issue: issueNodeId, repo: repository.id });
}

// Moves every signing request still in branes-ai/cla (open or closed).
async function sweep(github, core) {
  const issues = await github.paginate(github.rest.issues.listForRepo,
    { owner: "branes-ai", repo: "cla", state: "all", per_page: 100 });
  let n = 0;
  for (const i of issues) {
    if (i.pull_request || !(i.body || "").includes(MARKER)) continue;
    await moveToPrivate(github, i.node_id);
    n++;
  }
  core.info(`Moved ${n} leftover signing request(s) to private storage.`);
}

module.exports = { moveToPrivate, sweep };
