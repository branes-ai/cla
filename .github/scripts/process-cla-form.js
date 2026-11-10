// Decrypts a CLA signature submitted through the signing page (as a GitHub issue)
// and records it in the private cla-signatures checkout.
//
// Never prints the decrypted details: Actions logs of this public repository are public.
//
// Env: ISSUE_BODY, ISSUE_USER_LOGIN, ISSUE_USER_ID, ISSUE_URL, ISSUE_CREATED_AT,
//      CLA_FORM_PRIVATE_KEY, SIG_DIR, GITHUB_OUTPUT (optional, for step outputs)
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function out(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    const delim = "EOF_" + crypto.randomBytes(8).toString("hex");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}<<${delim}\n${value}\n${delim}\n`);
  }
}

function fail(reason) {
  out("result", "error");
  out("message", reason);
  console.log("Not recorded: " + reason);
  process.exit(0);
}

const body = process.env.ISSUE_BODY || "";
const login = process.env.ISSUE_USER_LOGIN || "";
const userId = Number(process.env.ISSUE_USER_ID || 0);
const m = body.match(/BRANES-CLA-ENCRYPTED-V1\s+([A-Za-z0-9+/=\s]+?)\s+END-BRANES-CLA/);
if (!m) fail("The encrypted block was missing or altered. Please submit again from the signing page.");
if (!process.env.CLA_FORM_PRIVATE_KEY) fail("The signing service is not configured yet (missing key). Branes.AI has been notified by this failed run.");

let data;
try {
  const env = JSON.parse(Buffer.from(m[1].replace(/\s+/g, ""), "base64").toString("utf8"));
  if (env.v !== 1) throw new Error("version");
  const aesKey = crypto.privateDecrypt(
    { key: process.env.CLA_FORM_PRIVATE_KEY, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(env.k, "base64"));
  const iv = Buffer.from(env.iv, "base64");
  const c = Buffer.from(env.c, "base64");
  const tag = c.subarray(c.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(c.subarray(0, c.length - 16)), decipher.final()]);
  data = JSON.parse(plain.toString("utf8"));
} catch (e) {
  fail("The encrypted block could not be read. Please submit again from the signing page without editing the text.");
}

const s = (x) => (typeof x === "string" ? x.trim() : "");
const required = ["name", "email", "address", "country", "contributor_type"];
for (const k of required) if (!s(data[k])) fail(`The form was missing "${k}". Please submit again from the signing page.`);
if (data.agreed !== true || data.agreement !== "Branes.AI Individual CLA v1.0") fail("The agreement was not accepted. Please tick the acceptance box on the signing page.");
if (s(data.github_login_entered).toLowerCase() !== login.toLowerCase()) {
  fail(`The GitHub username typed in the form (${s(data.github_login_entered) || "blank"}) does not match the account that submitted it (${login}). Please sign in to GitHub as the account that opens your pull requests, then submit again.`);
}

const sigDir = process.env.SIG_DIR;
const storePath = path.join(sigDir, "signatures", "icla-v1.json");
const detailsDir = path.join(sigDir, "signatures", "icla-v1-details");
fs.mkdirSync(detailsDir, { recursive: true });
let store = { signedContributors: [] };
if (fs.existsSync(storePath)) store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const signedAt = process.env.ISSUE_CREATED_AT;

const already = store.signedContributors.find((x) => x.id === userId);
if (!already) {
  store.signedContributors.push({
    name: login,
    id: userId,
    comment_id: null,
    created_at: signedAt,
    repoId: null,
    pullRequestNo: null,
    signature_method: "signing-page",
    signature_record: process.env.ISSUE_URL,
  });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2) + "\n");
}

const detailsPath = path.join(detailsDir, `${userId}-${login}.json`);
fs.writeFileSync(detailsPath, JSON.stringify({
  agreement: data.agreement,
  github_login: login,
  github_id: userId,
  signed_at: signedAt,
  signature_record: process.env.ISSUE_URL,
  name: s(data.name),
  email: s(data.email),
  address: s(data.address),
  country: s(data.country),
  contributor_type: s(data.contributor_type),
  employer: s(data.employer),
  pull_request: s(data.pull_request),
  page_time: s(data.page_time),
}, null, 2) + "\n");

out("result", already ? "updated" : "ok");
out("contributor_type", s(data.contributor_type));
out("pull_request", s(data.pull_request));
console.log(already ? "Details updated for an existing signer." : "Signature recorded.");
