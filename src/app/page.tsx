import { AuthTerminal } from "./AuthTerminal";

export default function Home() {
  // TODO(仮): 確認用に合言葉を画面に出している。あとで消す
  const codeHint = { level2: process.env.ACCESS_CODE_LEVEL2 ?? "", o5: process.env.ACCESS_CODE_O5 ?? "" };
  return <AuthTerminal codeHint={codeHint} />;
}
