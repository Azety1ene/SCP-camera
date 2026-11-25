// 顔検出(MediaPipe)の実行環境(WASM)を、node_modules から public/mediapipe/wasm に写す。
//
// - CDN から読み込まず自前で配信するため(外部への依存と、パッケージとのバージョンのずれをなくす)
// - 写したファイルは Git に含めない(.gitignore)。dev と build の前に毎回実行する
//
// 使い方: node scripts/copy-mediapipe.mjs

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// package.json は exports に含まれないので、本体の位置からパッケージのフォルダを求める
const pkgDir = dirname(require.resolve("@mediapipe/tasks-vision"));
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const from = join(pkgDir, "wasm");
const to = join("public", "mediapipe", "wasm");
const stamp = join(to, ".version");

if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === version) process.exit(0);

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
writeFileSync(stamp, `${version}\n`);
console.log(`MediaPipe の WASM (${version}) を ${to} に写しました`);
