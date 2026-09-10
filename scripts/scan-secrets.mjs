import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const patterns = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: "Google service-account key", pattern: /"private_key"\s*:\s*"-----BEGIN/ },
  { name: "GitHub token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "Stripe live key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/ }
];
const findings = [];
for (const file of files) {
  if (statSync(file).size > 5_000_000) continue;
  const content = readFileSync(file, "utf8");
  for (const candidate of patterns) if (candidate.pattern.test(content)) findings.push(`${file}: ${candidate.name}`);
}
if (findings.length) {
  console.error("Possible committed secrets (values suppressed):\n" + findings.join("\n") + "\nRotate each credential before removal if it was ever valid.");
  process.exitCode = 1;
} else console.log(`No supported secret signature found in ${files.length} tracked files.`);
