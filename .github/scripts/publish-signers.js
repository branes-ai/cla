// Rebuilds the public, scrambled signer list from the private branes-ai/cla-signatures
// store: everyone in signatures/icla-v1.json plus everyone on allowlist.txt.
// Never prints usernames or IDs: Actions logs of this public repository are public.
"use strict";
const fs = require("fs");
const path = require("path");
const { scramble } = require("./signers-lib.js");

module.exports = async ({ github, core, sigDir, outFile }) => {
  const ids = new Set();
  const store = JSON.parse(fs.readFileSync(path.join(sigDir, "signatures", "icla-v1.json"), "utf8"));
  for (const s of store.signedContributors || []) if (s.id) ids.add(Number(s.id));

  const logins = fs.readFileSync(path.join(sigDir, "allowlist.txt"), "utf8")
    .split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  let unresolved = 0;
  for (const login of logins) {
    try {
      const { data } = await github.rest.users.getByUsername({ username: login });
      ids.add(Number(data.id));
    } catch (e) {
      unresolved++;
    }
  }
  if (unresolved) core.warning(`${unresolved} allowlist entr${unresolved === 1 ? "y does" : "ies do"} not match a GitHub account. Check allowlist.txt in branes-ai/cla-signatures.`);

  const hashes = [...ids].map(scramble).sort();
  const text = [
    "# Branes.AI CLA: accounts covered by a signed agreement or onboarding agreement.",
    "# Each line is scrypt(GitHub account ID); see .github/scripts/signers-lib.js on main.",
    "# Generated automatically. Do not edit.",
    ...hashes, ""].join("\n");
  const old = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "";
  fs.writeFileSync(outFile, text);
  core.info(`Signer list has ${hashes.length} entries${old === text ? " (unchanged)" : " (updated)"}.`);
  return old !== text;
};
