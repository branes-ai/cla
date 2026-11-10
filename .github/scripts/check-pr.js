// Branes.AI CLA check for one pull request. Runs through actions/github-script inside the
// calling repository, with that repository's own GITHUB_TOKEN only. Uses no secrets.
"use strict";
const fs = require("fs");
const { scramble, readList } = require("./signers-lib.js");

const MARK = "<!-- branes-cla-check -->";
const SIGN = "https://branes-ai.github.io/cla/sign/";
const CLA = "https://github.com/branes-ai/cla";

async function upsertComment(github, context, number, body) {
  const comments = await github.paginate(github.rest.issues.listComments,
    { ...context.repo, issue_number: number, per_page: 100 });
  const mine = comments.find((c) => c.body && c.body.includes(MARK));
  if (mine) {
    if (mine.body !== body) await github.rest.issues.updateComment({ ...context.repo, comment_id: mine.id, body });
    return true;
  }
  return false;
}

module.exports = async ({ github, context, core, signersFile }) => {
  const pr = context.payload.pull_request;
  if (!pr) return core.info("Not a pull request event; nothing to check.");
  if (context.payload.action === "closed") return core.info("Pull request closed; nothing to check.");

  const covered = readList(fs.readFileSync(signersFile, "utf8"));
  const commits = await github.paginate(github.rest.pulls.listCommits,
    { ...context.repo, pull_number: pr.number, per_page: 100 });

  const people = new Map();
  const unlinked = new Set();
  for (const c of commits) {
    if (c.author && c.author.id) people.set(c.author.id, c.author.login);
    else unlinked.add((c.commit.author && c.commit.author.name) || "unknown");
  }
  const missing = [...people].filter(([id]) => !covered.has(scramble(id))).map(([, login]) => login);

  if (missing.length === 0 && unlinked.size === 0) {
    await upsertComment(github, context, pr.number,
      `${MARK}\n**Contributor License Agreement: all commit authors are covered.** Thank you.`);
    core.summary.addHeading("Contributor License Agreement: all commit authors are covered", 2);
    await core.summary.write();
    return core.info("All commit authors are covered by the Branes.AI CLA.");
  }

  const prUrl = pr.html_url;
  const lines = [MARK, "**A contributor license agreement is needed before this pull request can be merged.**", ""];
  if (missing.length) {
    lines.push("Not yet covered: " + missing.map((l) => `@${l}`).join(", "), "");
    lines.push("**Outside contributor?** Sign once on the signing page (about 2 minutes; your details stay private). This check then re-runs by itself within a few minutes. One signature covers every Branes.AI repository.");
    for (const l of missing) lines.push(`- @${l}: [sign the CLA](${SIGN}?login=${encodeURIComponent(l)}&pr=${encodeURIComponent(prUrl)})`);
    lines.push("",
      "**Joining Branes.AI as an employee, contractor or intern?** Do not sign. Your onboarding agreement covers you: ask your Branes.AI contact to add your GitHub username to the CLA allowlist. This check re-runs by itself within 15 minutes of that.",
      "",
      `**Contributing as part of your job at another company, or at a university?** Sign on the page above, and your employer or institution must also sign the [Corporate CLA](${CLA}/blob/main/CCLA.md). Contact kishore.kondapi@branes.ai.`,
      "");
  }
  if (unlinked.size) {
    lines.push(`**Commits not linked to a GitHub account** (author: ${[...unlinked].join(", ")}). The email address on these commits is not on any GitHub account, so they cannot be matched to a signature. Set your Git email to an address on your GitHub account (\`git config --global user.email\`), amend the commits and push again, or add that email in GitHub Settings → Emails.`, "");
  }
  lines.push(`To run this check again by hand, comment \`recheck\`. Agreements and instructions: ${CLA}`);
  const body = lines.join("\n");

  if (!(await upsertComment(github, context, pr.number, body)))
    await github.rest.issues.createComment({ ...context.repo, issue_number: pr.number, body });

  await core.summary
    .addHeading("Contributor License Agreement not yet accepted", 2)
    .addRaw(`At least one commit author on [this pull request](${prUrl}) is not yet covered by a Branes.AI contributor agreement, so the merge is blocked. This is expected, not a build error. The comment on the pull request has a personal signing link for each person.`, true)
    .addTable([
      [{ data: "Who you are", header: true }, { data: "What to do", header: true }],
      ["Outside contributor", `Sign on the <a href="${SIGN}">signing page</a>; this check re-runs by itself`],
      ["Branes.AI employee, contractor or intern", "Do not sign. Ask your Branes.AI contact to add you to the CLA allowlist"],
      ["Contributing for an employer or university", `Sign on the page, and your organization signs the <a href="${CLA}/blob/main/CCLA.md">Corporate CLA</a>`],
    ])
    .write();
  core.setFailed(`Contributor License Agreement not yet accepted by: ${[...missing, ...unlinked].join(", ")}. See the comment on ${prUrl}`);
};
