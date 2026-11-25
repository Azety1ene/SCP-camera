import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichText } from "@/components/report/RichText.tsx";

const TEXT = "表向き[[L3:手がかり]]と[[L4:重い事実]]と[[O5:撮影者本人]]。[注1]";

describe("RichText", () => {
  it("クリアランスが足りない黒塗りは、中身を DOM に出さず伏せ字にする", () => {
    const html = renderToStaticMarkup(<RichText text={TEXT} clearance="L2" />);
    expect(html).not.toContain("手がかり");
    expect(html).not.toContain("重い事実");
    expect(html).not.toContain("撮影者本人");
    expect(html).toContain("█");
    expect(html).toContain("閲覧にはより高いクリアランスが必要です");
  });

  it("昇格すると、そのレベルまでの黒塗りが読める", () => {
    const l3 = renderToStaticMarkup(<RichText text={TEXT} clearance="L3" />);
    expect(l3).toContain("手がかり");
    expect(l3).not.toContain("重い事実");
    const l4 = renderToStaticMarkup(<RichText text={TEXT} clearance="L4" />);
    expect(l4).toContain("重い事実");
    expect(l4).not.toContain("撮影者本人");
  });

  it("O5 はすべて読める", () => {
    const html = renderToStaticMarkup(<RichText text={TEXT} clearance="O5" />);
    for (const word of ["手がかり", "重い事実", "撮影者本人"]) expect(html).toContain(word);
    expect(html).not.toContain("[[");
  });

  it("脚注の参照、改行、段落、見出しを変換する", () => {
    const html = renderToStaticMarkup(<RichText text={"## 見出し\n\n1行目\n2行目[注2]"} clearance="L2" />);
    expect(html).toContain("<h3");
    expect(html).toContain("見出し");
    expect(html).toContain("<br/>");
    expect(html).toContain('href="#fn-2"');
  });

  it("レベルのない黒塗り(古い記録や書庫)も、伏せ字にする", () => {
    const html = renderToStaticMarkup(<RichText text="[[古い記法の中身]]" clearance="L2" />);
    expect(html).not.toContain("古い記法の中身");
  });
});
