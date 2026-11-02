// Which file is the intent master, with and without an open .hesp file.

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { findMaster, intentFiles } from "../master.js";

test("the master: configured, else the importer of the active file, else the shallowest file nothing imports", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hesp-master-"));
  try {
    const write = (f: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), text);
    };
    write("docs/app.hesp", 'hesperus 0.1\n\nsystem app {\n  import "./parts/web.hesp"\n}\n');
    write("docs/parts/web.hesp", "hesperus 0.1\n\nsubsystem web\n");
    write("deep/er/other.hesp", "hesperus 0.1\n\nsystem other\n");
    write("gen/app.hesp", 'hesperus 0.1\ngenerated "hesperus-ts"\n\nsystem app\n');
    write(".hesperus/actual/app.hesp", 'hesperus 0.1\ngenerated "hesperus-ts"\n\nsystem app\n');
    const at = (f: string) => path.join(root, f);
    assert.deepEqual(intentFiles(root), [at("deep/er/other.hesp"), at("docs/app.hesp"), at("docs/parts/web.hesp")]);
    assert.equal(findMaster(root, undefined, ""), at("docs/app.hesp"));
    assert.equal(findMaster(root, at("docs/parts/web.hesp"), ""), at("docs/app.hesp"));
    assert.equal(findMaster(root, at("deep/er/other.hesp"), ""), at("deep/er/other.hesp"));
    assert.equal(findMaster(root, undefined, "deep/er/other.hesp"), at("deep/er/other.hesp"));
    assert.equal(findMaster(fs.mkdtempSync(path.join(os.tmpdir(), "hesp-empty-")), undefined, ""), undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an intent init wrote into .hesperus is found; other dot directories are not searched", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hesp-master-"));
  try {
    fs.mkdirSync(path.join(root, ".hesperus", "actual"), { recursive: true });
    fs.mkdirSync(path.join(root, ".cache"));
    fs.writeFileSync(path.join(root, ".hesperus", "app.hesp"), "hesperus 0.1\n\nsystem app\n");
    fs.writeFileSync(path.join(root, ".hesperus", "actual", "app.hesp"), 'hesperus 0.1\ngenerated "hesperus-ts"\n\nsystem app\n');
    fs.writeFileSync(path.join(root, ".cache", "old.hesp"), "hesperus 0.1\n\nsystem old\n");
    assert.deepEqual(intentFiles(root), [path.join(root, ".hesperus", "app.hesp")]);
    assert.equal(findMaster(root, undefined, ""), path.join(root, ".hesperus", "app.hesp"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
