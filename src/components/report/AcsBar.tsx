import { useId, type ReactNode } from "react";
import { DISRUPTION_CLASSES, RISK_CLASSES, type StoredReport } from "@/lib/report/schema.ts";

/**
 * 異常分類システム(ACS)風の帯。収容・撹乱・リスクの3軸を、色と記号で示す。
 * 記号は Wiki のものを使わず、ここで描いている。
 */

const CONTAINMENT_COLOR: Record<string, string> = {
  Safe: "#2f6f46",
  Euclid: "#9a7a1f",
  Keter: "#8f1d1d",
  Thaumiel: "#38327a",
  Neutralized: "#5f6670",
};

const SCALE_COLORS = ["#3d5a7a", "#2f6f46", "#9a7a1f", "#b0561f", "#8f1d1d"];

const CONTAINMENT_LABEL: Record<string, string> = {
  Safe: "安全",
  Euclid: "要注意",
  Keter: "収容困難",
  Thaumiel: "機密",
  Neutralized: "無力化",
};

const DISRUPTION_LABEL = ["影響なし", "局所的", "地域的", "広域", "世界規模"];
const RISK_LABEL = ["ほぼ無害", "軽微", "要警戒", "危険", "致命的"];

function ContainmentIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
      <rect x="4" y="7" width="16" height="13" fill="none" stroke={color} strokeWidth="2" />
      <path d="M4 7 L12 3 L20 7" fill="none" stroke={color} strokeWidth="2" />
      <rect x="10" y="11" width="4" height="5" fill={color} />
    </svg>
  );
}

/** 段階が上がるほど、外へ伸びる線が増える */
function DisruptionIcon({ level, color }: { level: number; color: string }) {
  const rays = [0, 1, 2, 3, 4, 5, 6, 7].slice(0, (level + 1) * 2 - (level === 4 ? 2 : 0));
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="3.5" fill={color} />
      {rays.map((i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={12 + Math.cos(angle) * 6}
            y1={12 + Math.sin(angle) * 6}
            x2={12 + Math.cos(angle) * 10}
            y2={12 + Math.sin(angle) * 10}
            stroke={color}
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}

/** 段階が上がるほど、三角の中が塗られていく */
function RiskIcon({ level, color }: { level: number; color: string }) {
  const fill = (level + 1) / 5;
  // 同じ画面に報告書が2つ以上あっても、切り抜きの ID が重ならないようにする
  const clipId = `risk-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y={22 - 18 * fill} width="24" height={18 * fill + 2} />
        </clipPath>
      </defs>
      <path d="M12 3 L22 21 L2 21 Z" fill={color} clipPath={`url(#${clipId})`} opacity="0.85" />
      <path d="M12 3 L22 21 L2 21 Z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** 表の1欄。色は記号と値だけに使い、欄の片側に色線は引かない */
function Cell({ label, value, note, color, icon }: { label: string; value: string; note: string; color: string; icon: ReactNode }) {
  return (
    <div className="flex flex-col">
      <p className="border-b border-ink/25 bg-ink/[0.06] px-2 py-1 text-[10px] tracking-wider text-ink/70">{label}</p>
      <div className="flex items-center gap-2 px-2 py-2">
        {icon}
        <div className="min-w-0 leading-tight">
          <p className="truncate font-mono text-[13px] font-bold" style={{ color }}>
            {value}
          </p>
          <p className="text-[10px] text-ink/75">{note}</p>
        </div>
      </div>
    </div>
  );
}

export function AcsBar({ itemNumber, report }: { itemNumber: string; report: StoredReport }) {
  const containmentColor = CONTAINMENT_COLOR[report.objectClass] ?? "#5f6670";
  const disruption = report.disruptionClass ? DISRUPTION_CLASSES.indexOf(report.disruptionClass) : -1;
  const risk = report.riskClass ? RISK_CLASSES.indexOf(report.riskClass) : -1;

  return (
    <div className="mt-4 border border-ink">
      <div className="flex items-center justify-between border-b border-ink bg-ink/[0.06] px-2.5 py-1 font-mono text-[10px] tracking-wider text-ink">
        <span className="font-bold">{itemNumber}</span>
        <span>異常分類システム</span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-ink/40">
        <Cell
          label="収容"
          value={report.objectClass}
          note={CONTAINMENT_LABEL[report.objectClass] ?? ""}
          color={containmentColor}
          icon={<ContainmentIcon color={containmentColor} />}
        />
        <Cell
          label="撹乱"
          value={disruption >= 0 ? report.disruptionClass! : "Pending"}
          note={disruption >= 0 ? DISRUPTION_LABEL[disruption] : "情報不足"}
          color={disruption >= 0 ? SCALE_COLORS[disruption] : "#5f6670"}
          icon={<DisruptionIcon level={Math.max(0, disruption)} color={disruption >= 0 ? SCALE_COLORS[disruption] : "#5f6670"} />}
        />
        <Cell
          label="リスク"
          value={risk >= 0 ? report.riskClass! : "Pending"}
          note={risk >= 0 ? RISK_LABEL[risk] : "情報不足"}
          color={risk >= 0 ? SCALE_COLORS[risk] : "#5f6670"}
          icon={<RiskIcon level={Math.max(0, risk)} color={risk >= 0 ? SCALE_COLORS[risk] : "#5f6670"} />}
        />
      </div>
    </div>
  );
}

/** 朱肉の丸い印。2文字を縦に並べる */
function Seal({ text }: { text: string }) {
  return (
    <span
      className="flex h-9 w-9 rotate-[-6deg] flex-col items-center justify-center rounded-full border-[1.5px] border-[#b8392c] font-doc text-[10px] font-bold leading-[1.05] text-[#b8392c] opacity-85 mix-blend-multiply"
      aria-label={`${text}の印`}
    >
      {[...text].map((ch, i) => (
        <span key={i}>{ch}</span>
      ))}
    </span>
  );
}

/**
 * 公文書の決裁欄(起案・審査・承認)。押されていない欄は空欄のまま。
 * stamps は各欄に押す2文字。null なら未決裁
 */
export function ApprovalBox({ stamps }: { stamps: [string | null, string | null, string | null] }) {
  const labels = ["起案", "審査", "承認"];
  return (
    <table className="border-collapse text-center text-[9px] text-ink/70" aria-label="決裁欄">
      <tbody>
        <tr>
          {labels.map((label) => (
            <th key={label} className="w-11 border border-ink/50 py-0.5 font-normal">
              {label}
            </th>
          ))}
        </tr>
        <tr>
          {stamps.map((stamp, i) => (
            <td key={i} className="h-11 border border-ink/50">
              <span className="flex items-center justify-center">{stamp ? <Seal text={stamp} /> : null}</span>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** 文書の右上に押される機密の印 */
export function ClassifiedStamp() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -top-1 right-0 rotate-[-9deg] select-none border-[3px] border-[#b8392c] px-2 py-0.5 text-center font-doc leading-tight text-[#b8392c] opacity-80 mix-blend-multiply"
    >
      <p className="text-lg font-bold tracking-[0.3em]">機密</p>
      <p className="font-mono text-[8px] tracking-[0.25em]">CLASSIFIED</p>
    </div>
  );
}
