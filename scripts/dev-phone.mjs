// スマホ実機で確認するための開発サーバー起動スクリプト。
//
// - PC の LAN 内 IP アドレスで HTTPS の開発サーバーを立てる(スマホのカメラは HTTPS でないと使えない)
// - その IP 用の自己署名証明書を .certificates/ に作る(初回のみ。Git には含めない)
// - 自己署名なので、スマホで開くと警告が出る。「詳細」から進めば使える
//
// 使い方: pnpm dev:phone

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const PORT = process.env.PORT ?? "3000";

function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal && /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(address.address)) {
        return address.address;
      }
    }
  }
  return null;
}

const ip = lanAddress();
if (!ip) {
  console.error("LAN の IP アドレスが見つかりません。Wi-Fi に接続しているか確認してください。");
  process.exit(1);
}

const dir = ".certificates";
const key = join(dir, `${ip}-key.pem`);
const cert = join(dir, `${ip}.pem`);

if (!existsSync(key) || !existsSync(cert)) {
  mkdirSync(dir, { recursive: true });
  const config = join(dir, `${ip}.cnf`);
  writeFileSync(
    config,
    [
      "[req]",
      "distinguished_name=dn",
      "x509_extensions=ext",
      "prompt=no",
      "[dn]",
      "CN=SCP-camera dev",
      "[ext]",
      `subjectAltName=IP:${ip},DNS:localhost`,
      "basicConstraints=CA:FALSE",
      "keyUsage=digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
      "",
    ].join("\n"),
  );
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30", "-keyout", key, "-out", cert, "-config", config], {
    stdio: "ignore",
  });
  console.log(`証明書を作成しました: ${cert}`);
}

console.log(`\nスマホ(同じ Wi-Fi)で開く: https://${ip}:${PORT}\n`);

const child = spawn(
  "pnpm",
  ["exec", "next", "dev", "-H", ip, "-p", PORT, "--experimental-https", "--experimental-https-key", key, "--experimental-https-cert", cert],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 0));
