// Shared helpers for the Branes.AI CLA signer list.
//
// The public file signers.txt (branch "signers" of branes-ai/cla) holds one scrambled
// entry per covered GitHub account: scrypt(GitHub account ID). It lets every repository
// check a pull request without any secret, while the file itself does not show who is
// covered. scrypt is deliberately slow and memory-hard, so recovering the list by
// trying every possible account ID is impractical.
"use strict";
const crypto = require("crypto");

const SALT = "branes-ai-cla-signers-v1";
const PARAMS = { N: 65536, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };

function scramble(githubId) {
  return crypto.scryptSync(String(githubId), SALT, 32, PARAMS).toString("hex");
}

function readList(text) {
  return new Set(
    text.split("\n").map((s) => s.trim()).filter((s) => /^[0-9a-f]{64}$/.test(s)));
}

module.exports = { scramble, readList };
