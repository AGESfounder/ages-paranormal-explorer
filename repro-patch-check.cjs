// Scratch verification script: replicates patch-package's makePatch git-diff
// mechanism against the pristine registry copy of
// @capacitor-community/text-to-speech@6.1.0 and the project's edited copy.
// Run with: node repro-patch-check.cjs
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PKG_PATH = path.join("node_modules", "@capacitor-community", "text-to-speech");
const SWIFT = path.join(PKG_PATH, "ios/Sources/TextToSpeechPlugin/TextToSpeech.swift");
const PRISTINE = "/home/appuser/tmp/pristine-check/node_modules/@capacitor-community/text-to-speech";
const EDITED = "/home/appuser/project/node_modules/@capacitor-community/text-to-speech";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repro-"));
console.log("tmp repo:", tmp);

const git = (...args) => {
  const r = spawnSync("git", args, {
    cwd: tmp,
    env: Object.assign({}, process.env, { HOME: tmp }),
    maxBuffer: 1024 * 1024 * 100,
    encoding: "utf8",
  });
  console.log(`git ${args.join(" ")} -> status=${r.status}${r.stderr ? " stderr=" + r.stderr.trim() : ""}`);
  return r;
};

const dest = path.join(tmp, PKG_PATH);
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(PRISTINE, dest, { recursive: true });
fs.writeFileSync(path.join(tmp, ".gitignore"), "!/node_modules\n\n");

git("init");
git("config", "--local", "user.name", "patch-package");
git("config", "--local", "user.email", "patch@pack.age");
git("add", "-f", PKG_PATH);
const staged1 = git("ls-files", "--cached");
console.log("staged files after add#1:", staged1.stdout.split("\n").filter(Boolean).length);
git("commit", "--allow-empty", "-m", "init");
const head = git("rev-parse", "HEAD");
console.log("HEAD:", head.stdout.trim());
const tree = git("ls-tree", "-r", "--name-only", "HEAD");
console.log("files in HEAD commit:", tree.stdout.split("\n").filter(Boolean).length);
const committedSwift = git("show", `HEAD:${SWIFT.split(path.sep).join("/")}`);
console.log("committed swift line 19:", committedSwift.stdout.split("\n")[18]);

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(EDITED, dest, { recursive: true });

const worktreeSwift = fs.readFileSync(path.join(tmp, SWIFT), "utf8");
console.log("worktree swift line 19:", worktreeSwift.split("\n")[18]);

git("add", "-f", PKG_PATH);
const status = git("status", "--porcelain");
console.log("status after add#2:", JSON.stringify(status.stdout.slice(0, 200)));
const diff = git("diff", "--cached", "--no-color", "--ignore-space-at-eol", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/");
console.log("---DIFF STDOUT LENGTH---", diff.stdout.length);
console.log(diff.stdout.slice(0, 2000));

fs.rmSync(tmp, { recursive: true, force: true });