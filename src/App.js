// App.jsx - Main React component with all logic and inline styles removed

import { useState, useCallback, useRef, useEffect } from "react";
import "./styles.css"; // Import the CSS file

// ─── Constants ────────────────────────────────────────────────────────────────
const GET_ALL_IPS_URL = "https://10.191.171.12:5443/EISHOME/prDrSync/getAllIps/";
const API_URL = "https://10.191.171.12:5443/EISHOME/prDrSync/checkSyncIPSpecific/";

const GROUPS = [
  { id: "a", label: "SUBSET A", sublabel: "10.188.24.x  /  10.177.40.x", prefix: "10.188.24." },
  { id: "b", label: "SUBSET B", sublabel: "10.188.25.x  /  10.177.41.x", prefix: "10.188.25." },
];

// ─── Theme Definitions ──────────────────────────────────────────────────────
const DARK = {
  bg: "#070910",
  surface: "#0c0f1a",
  card: "#101425",
  cardHover: "#141829",
  border: "#1a2035",
  borderMid: "#222d48",
  accent: "#4f8ef7",
  accentDim: "rgba(79,142,247,0.12)",
  green: "#00d68f",
  greenBg: "rgba(0,214,143,0.08)",
  greenBorder: "rgba(0,214,143,0.25)",
  red: "#ff4060",
  redBg: "rgba(255,64,96,0.08)",
  redBorder: "rgba(255,64,96,0.25)",
  amber: "#f5a623",
  amberBg: "rgba(245,166,35,0.08)",
  amberBorder: "rgba(245,166,35,0.25)",
  purple: "#a78bfa",
  purpleBg: "rgba(167,139,250,0.08)",
  purpleBorder: "rgba(167,139,250,0.25)",
  text: "#e8f0fc",
  textSub: "#8294b8",
  textMuted: "#3d4f72",
  statBg: "#0d1120",
  inputBg: "#0d1120",
  headerBg: "#0a0d18",
  shadowColor: "rgba(0,0,0,0.6)",
};

const LIGHT = {
  bg: "#f0f3fa",
  surface: "#ffffff",
  card: "#ffffff",
  cardHover: "#f7f9ff",
  border: "#dde4f0",
  borderMid: "#c5d0e8",
  accent: "#2563eb",
  accentDim: "rgba(37,99,235,0.10)",
  green: "#059669",
  greenBg: "rgba(5,150,105,0.08)",
  greenBorder: "rgba(5,150,105,0.30)",
  red: "#dc2626",
  redBg: "rgba(220,38,38,0.06)",
  redBorder: "rgba(220,38,38,0.30)",
  amber: "#d97706",
  amberBg: "rgba(217,119,6,0.08)",
  amberBorder: "rgba(217,119,6,0.30)",
  purple: "#7c3aed",
  purpleBg: "rgba(124,58,237,0.07)",
  purpleBorder: "rgba(124,58,237,0.28)",
  text: "#111827",
  textSub: "#4b5e80",
  textMuted: "#9ca8bf",
  statBg: "#f5f7fd",
  inputBg: "#f5f7fd",
  headerBg: "#ffffff",
  shadowColor: "rgba(0,0,0,0.08)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const oct = ip => ip.split(".")[3];

function buildPairs(serverIps) {
  const ipSet = new Set(serverIps);
  const pairs = [];
  for (const pr of serverIps) {
    const parts = pr.split(".");
    if (parts[1] !== "188") continue;
    const drThird = parts[2] === "24" ? "40" : parts[2] === "25" ? "41" : null;
    if (!drThird) continue;
    const dr = `10.177.${drThird}.${parts[3]}`;
    if (ipSet.has(dr) || true) {
      pairs.push({ pr, dr, id: `${pr}|${dr}` });
    }
  }
  return pairs;
}

function getDiff(data) {
  return data?.differnces ?? data?.differences ?? null;
}

function getMismatches(data) {
  const diff = getDiff(data);
  return diff?.property_mismatches ?? [];
}

function parseEntry(str) {
  const arrowParts = str.split(" -> ");
  const first = arrowParts[0];
  const colonIdx = first.lastIndexOf(":");
  const name = colonIdx > -1 ? first.slice(0, colonIdx).trim() : first.trim();
  const port = colonIdx > -1 ? first.slice(colonIdx + 1).trim() : null;
  const trail = arrowParts.slice(1);
  return { name, port, trail };
}

function downloadCSV(pairs, results) {
  const rows = [["PR IP", "DR IP", "Status", "Missing in DR", "Missing in PR", "Property Mismatches", "Error", "Checked At"]];
  for (const p of pairs) {
    const r = results[p.id];
    if (!r) {
      rows.push([p.pr, p.dr, "PENDING", "", "", "", "", ""]);
      continue;
    }
    const d = getDiff(r.data);
    const mm = getMismatches(r.data);
    rows.push([
      p.pr, p.dr,
      r.loading ? "CHECKING" : r.error ? "ERROR" : (r.data?.status || ""),
      d?.missing_in_env2?.length ?? "",
      d?.missing_in_env1?.length ?? "",
      mm.length,
      r.error || "",
      r.timestamp || ""
    ]);
  }
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sync_report_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function cardState(r) {
  if (!r) return "pending";
  if (r.loading) return "loading";
  if (r.error) return "errored";
  if (r.data?.status === "IN SYNC") return "synced";
  if (r.data?.status === "NOT IN SYNC") return "drifted";
  return "pending";
}

const STATE_LABEL = {
  synced: "In Sync",
  drifted: "Out of Sync",
  errored: "Error",
  loading: "Checking…",
  pending: "Pending"
};

// ─── Components ──────────────────────────────────────────────────────────────

// Spinner Component
function Spinner({ size = 14, color }) {
  return (
    <div
      className="spin-anim"
      style={{
        width: size,
        height: size,
        border: `2px solid rgba(128,128,128,0.2)`,
        borderTopColor: color,
        borderRadius: "50%",
        flexShrink: 0
      }}
    />
  );
}

// Theme Toggle Component
function ThemeToggle({ isDark, onToggle }) {
  return (
    <button className="theme-toggle" onClick={onToggle} title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}>
      <div className="tt-knob">{isDark ? "🌙" : "☀️"}</div>
      <span className="tt-label">{isDark ? "DARK" : "LIGHT"}</span>
    </button>
  );
}

// Server Card Component
function ServerCard({ pair, result, onClick, C }) {
  const state = cardState(result);
  const diff = getDiff(result?.data);
  const mismatches = getMismatches(result?.data);
  const diffCount = diff ? (diff.missing_in_env2?.length || 0) + (diff.missing_in_env1?.length || 0) : 0;
  const mismatchCount = mismatches.length;

  let cardCls = "sc";
  if (state === "synced") cardCls += " synced";
  if (state === "drifted") cardCls += " drifted";
  if (state === "errored") cardCls += " errored";

  // Apply theme colors via inline styles
  const cardStyle = {
    border: `1px solid ${C.border}`,
    background: C.card,
    boxShadow: `0 1px 3px ${C.shadowColor}`
  };

  if (state === "synced") {
    Object.assign(cardStyle, {
      borderColor: C.greenBorder,
      background: `linear-gradient(150deg, ${C.card} 60%, rgba(0,214,143,0.04))`
    });
  } else if (state === "drifted") {
    Object.assign(cardStyle, {
      borderColor: C.redBorder,
      background: `linear-gradient(150deg, ${C.card} 60%, rgba(255,64,96,0.04))`
    });
  }

  return (
    <div className={cardCls} style={cardStyle} onClick={() => onClick(pair, result)}>
      <div className={`sc-bar ${state}`} style={{
        background: state === 'synced' ? C.green : state === 'drifted' ? C.red : state === 'errored' ? C.amber : C.border
      }} />
      {state === "loading" && (
        <div className="sc-shimmer" style={{
          background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)`
        }} />
      )}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, gap: 6 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: "-0.01em", lineHeight: 1 }}>
            .{oct(pair.pr)}
          </span>
          <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 500, letterSpacing: "0.04em" }}>OCTET</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, paddingTop: 2 }}>
          {state === "loading" && <Spinner size={10} color={C.accent} />}
          <span className={`slabel ${state}`} style={{
            color: state === 'synced' ? C.green : state === 'drifted' ? C.red : state === 'errored' ? C.amber : C.textMuted,
            background: state === 'synced' ? C.greenBg : state === 'drifted' ? C.redBg : state === 'errored' ? C.amberBg : 'transparent',
            border: state === 'pending' ? `1px solid ${C.border}` : 'none'
          }}>{STATE_LABEL[state]}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, letterSpacing: "0.06em", minWidth: 18 }}>PR</span>
          <span style={{ fontSize: 11, color: C.textSub, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{pair.pr}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.green, letterSpacing: "0.06em", minWidth: 18 }}>DR</span>
          <span style={{ fontSize: 11, color: C.textSub, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{pair.dr}</span>
        </div>
      </div>
      {state === "drifted" && (diffCount > 0 || mismatchCount > 0) && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {diffCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, boxShadow: `0 0 6px ${C.red}` }} />
              <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>{diffCount} missing entr{diffCount !== 1 ? "ies" : "y"}</span>
            </div>
          )}
          {mismatchCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.purple, boxShadow: `0 0 6px ${C.purple}` }} />
              <span style={{ fontSize: 11, color: C.purple, fontWeight: 600 }}>{mismatchCount} propert{mismatchCount !== 1 ? "ies" : "y"} mismatched</span>
            </div>
          )}
        </div>
      )}
      {state === "errored" && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.amber, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
          ⚠ {result.error}
        </div>
      )}
    </div>
  );
}

// Entry List Component
function EntryList({ items, type, collapsed, onToggle, C }) {
  if (!items || items.length === 0) return null;
  const isMissDR = type === "env2";
  const colorVal = isMissDR ? C.red : C.amber;
  const bgVal = isMissDR ? C.redBg : C.amberBg;
  const borderVal = isMissDR ? C.redBorder : C.amberBorder;
  const icon = isMissDR ? "↓" : "↑";
  const heading = isMissDR
    ? "Present on PR, missing on DR — DR needs to be updated"
    : "Present on DR, missing on PR — needs investigation";

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: bgVal, border: `1px solid ${borderVal}`, flexShrink: 0 }}>
          <span style={{ color: colorVal, fontSize: 14, fontWeight: 700 }}>{icon}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: colorVal, letterSpacing: "0.05em" }}>
              {isMissDR ? "MISSING IN DR" : "MISSING IN PR"}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: colorVal, background: `${colorVal}18`, border: `1px solid ${colorVal}33`, borderRadius: 20, padding: "2px 9px" }}>
              {items.length} {items.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>{heading}</div>
        </div>
        <button className="btn btn-ghost" style={{ padding: "4px 11px", fontSize: 11 }} onClick={onToggle}>
          {collapsed ? "SHOW" : "HIDE"}
        </button>
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((entry, i) => {
            const { name, port, trail } = parseEntry(entry);
            return (
              <div key={i} className="diff-entry" style={{ borderLeft: `3px solid ${colorVal}` }}>
                <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, minWidth: 24, paddingTop: 1, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: colorVal, background: `${colorVal}12`, border: `1px solid ${colorVal}28`, borderRadius: 5, padding: "2px 9px", flexShrink: 0, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
                  {name}
                </span>
                {port && (
                  <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0, paddingTop: 2 }}>
                    <span style={{ color: C.textMuted, marginRight: 4, fontWeight: 500 }}>PORT</span>
                    <span style={{ color: C.textSub, fontWeight: 700, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{port}</span>
                  </span>
                )}
                {trail.length > 0 && (
                  <span style={{ fontSize: 11, color: C.textMuted, flex: 1, minWidth: 120, paddingTop: 2, lineHeight: 1.6 }}>
                    {trail.map((seg, si) => (
                      <span key={si}>
                        {si > 0 && <span style={{ color: C.textMuted, margin: "0 5px", fontSize: 10 }}>›</span>}
                        <span style={{ color: C.textSub }}>{seg}</span>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Property Mismatch List Component
function PropertyMismatchList({ items, collapsed, onToggle, C, isDark }) {
  if (!items || items.length === 0) return null;

  function parseLocation(loc) {
    return loc ? loc.split(" -> ").map(s => s.trim()) : [];
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: C.purpleBg, border: `1px solid ${C.purpleBorder}`, flexShrink: 0
        }}>
          <span style={{ color: C.purple, fontSize: 14, fontWeight: 700 }}>≠</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.purple, letterSpacing: "0.05em" }}>
              PROPERTY MISMATCHES
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: C.purple,
              background: `${C.purple}18`, border: `1px solid ${C.purple}33`,
              borderRadius: 20, padding: "2px 9px"
            }}>
              {items.length} {items.length === 1 ? "property" : "properties"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>
            Config values differ between PR and DR — manual reconciliation required
          </div>
        </div>
        <button className="btn btn-ghost" style={{ padding: "4px 11px", fontSize: 11 }} onClick={onToggle}>
          {collapsed ? "SHOW" : "HIDE"}
        </button>
      </div>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((mm, i) => {
            const segments = parseLocation(mm.location);
            const hasValues = mm.env1 !== undefined || mm.env2 !== undefined;
            return (
              <div key={i} className="mismatch-entry">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{
                    fontSize: 11, color: C.textMuted, fontWeight: 600, minWidth: 24,
                    paddingTop: 2, fontFamily: "'SF Mono', 'Fira Code', monospace", flexShrink: 0
                  }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, flex: 1 }}>
                    {segments.map((seg, si) => (
                      <span key={si} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {si > 0 && (
                          <span style={{ color: C.textMuted, fontSize: 11, fontWeight: 400 }}>›</span>
                        )}
                        <span style={{
                          fontSize: 12, fontWeight: si === segments.length - 1 ? 700 : 500,
                          color: si === segments.length - 1 ? C.text : C.textSub,
                          fontFamily: "'SF Mono', 'Fira Code', monospace",
                          background: si === segments.length - 1
                            ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)")
                            : "transparent",
                          borderRadius: 4, padding: si === segments.length - 1 ? "1px 6px" : "0"
                        }}>
                          {seg}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {mm.property && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 34 }}>
                    <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: "0.05em" }}>PROPERTY</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: C.purple,
                      background: C.purpleBg, border: `1px solid ${C.purpleBorder}`,
                      borderRadius: 5, padding: "2px 9px",
                      fontFamily: "'SF Mono', 'Fira Code', monospace"
                    }}>
                      {mm.property}
                    </span>
                  </div>
                )}

                {hasValues && (
                  <div style={{ display: "flex", alignItems: "stretch", gap: 8, paddingLeft: 34, flexWrap: "wrap" }}>
                    <div style={{
                      flex: 1, minWidth: 140,
                      background: C.greenBg, border: `1px solid ${C.greenBorder}`,
                      borderRadius: 7, padding: "8px 12px"
                    }}>
                      <div style={{ fontSize: 10, color: C.green, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 4 }}>PR VALUE</div>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: C.green,
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                        wordBreak: "break-all"
                      }}>
                        {mm.env1 !== undefined && mm.env1 !== "" ? mm.env1 : <span style={{ opacity: 0.5, fontStyle: "italic" }}>—</span>}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.textMuted, fontSize: 16, fontWeight: 300 }}>
                      ≠
                    </div>

                    <div style={{
                      flex: 1, minWidth: 140,
                      background: C.redBg, border: `1px solid ${C.redBorder}`,
                      borderRadius: 7, padding: "8px 12px"
                    }}>
                      <div style={{ fontSize: 10, color: C.red, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 4 }}>DR VALUE</div>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: C.red,
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                        wordBreak: "break-all"
                      }}>
                        {mm.env2 !== undefined && mm.env2 !== "" ? mm.env2 : <span style={{ opacity: 0.5, fontStyle: "italic" }}>—</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Detail Modal Component
function DetailModal({ pair, result, onClose, C, isDark }) {
  const [collapseDR, setCollapseDR] = useState(false);
  const [collapsePR, setCollapsePR] = useState(false);
  const [collapseMismatch, setCollapseMismatch] = useState(false);

  const data = result?.data;
  const isSynced = data?.status === "IN SYNC";
  const diff = getDiff(data);
  const missDR = diff?.missing_in_env2 || [];
  const missPR = diff?.missing_in_env1 || [];
  const mismatches = getMismatches(data);
  const totalDiff = missDR.length + missPR.length;
  const state = cardState(result);
  const barColor = state === "synced" ? C.green : state === "drifted" ? C.red : C.amber;

  const totalIssues = totalDiff + mismatches.length;

  return (
    <div className="overlay" style={{ background: isDark ? "rgba(0,0,0,0.85)" : "rgba(17,24,39,0.65)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ background: C.surface, boxShadow: `0 24px 80px ${isDark ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.2)"}` }}>
        <div className="mh">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 4, height: 30, borderRadius: 2, background: barColor, boxShadow: `0 0 10px ${barColor}88` }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.02em", color: C.text, display: "flex", alignItems: "center", gap: 10 }}>
                Server Pair
                <span style={{ color: C.accent, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>.{oct(pair.pr)}</span>
                <span className={`slabel ${state}`} style={{
                  color: state === 'synced' ? C.green : state === 'drifted' ? C.red : state === 'errored' ? C.amber : C.textMuted,
                  background: state === 'synced' ? C.greenBg : state === 'drifted' ? C.redBg : state === 'errored' ? C.amberBg : 'transparent',
                  border: state === 'pending' ? `1px solid ${C.border}` : 'none'
                }}>{STATE_LABEL[state]}</span>
              </div>
              {result?.timestamp && (
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3, fontWeight: 400 }}>
                  Last checked: {result.timestamp}
                </div>
              )}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "5px 10px", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
        <div className="mb">
          {result?.error && (
            <div style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 10, padding: "14px 18px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 15 }}>⚠</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.amber, letterSpacing: "0.05em" }}>REQUEST FAILED</span>
              </div>
              <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65 }}>{result.error}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: C.textMuted }}>
                Verify connectivity to{" "}
                <span style={{ color: C.text, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{pair.pr}</span>
                {" "}and{" "}
                <span style={{ color: C.text, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{pair.dr}</span>.
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", boxShadow: `0 1px 3px ${C.shadowColor}` }}>
              <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>PR SERVER</div>
              <div style={{ fontSize: 14, color: C.accent, fontWeight: 700, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{pair.pr}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3, fontWeight: 500 }}>Primary / Production</div>
            </div>
            <div style={{ flex: 1, minWidth: 150, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", boxShadow: `0 1px 3px ${C.shadowColor}` }}>
              <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>DR SERVER</div>
              <div style={{ fontSize: 14, color: C.green, fontWeight: 700, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{pair.dr}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3, fontWeight: 500 }}>Disaster Recovery</div>
            </div>
            {!isSynced && totalIssues > 0 && (
              <div style={{ flex: 1, minWidth: 150, background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "12px 16px", boxShadow: `0 1px 3px ${C.shadowColor}` }}>
                <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>TOTAL ISSUES</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 26, color: C.red, fontWeight: 800, lineHeight: 1 }}>{totalIssues}</span>
                  <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>issues found</span>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
                  {missDR.length > 0 && <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>↓ {missDR.length} in DR</span>}
                  {missPR.length > 0 && <span style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>↑ {missPR.length} in PR</span>}
                  {mismatches.length > 0 && <span style={{ fontSize: 11, color: C.purple, fontWeight: 600 }}>≠ {mismatches.length} mismatch{mismatches.length !== 1 ? "es" : ""}</span>}
                </div>
              </div>
            )}
          </div>

          {isSynced && (
            <div style={{ textAlign: "center", padding: "36px 0", background: C.greenBg, borderRadius: 12, border: `1px solid ${C.greenBorder}` }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.green, letterSpacing: "0.04em", marginBottom: 8 }}>FULLY IN SYNC</div>
              <div style={{ fontSize: 14, color: C.textSub, fontWeight: 400, lineHeight: 1.6 }}>No configuration drift detected between PR and DR.</div>
            </div>
          )}

          {!isSynced && diff && (
            <>
              <EntryList items={missDR} type="env2" collapsed={collapseDR} onToggle={() => setCollapseDR(v => !v)} C={C} />
              <EntryList items={missPR} type="env1" collapsed={collapsePR} onToggle={() => setCollapsePR(v => !v)} C={C} />
              <PropertyMismatchList
                items={mismatches}
                collapsed={collapseMismatch}
                onToggle={() => setCollapseMismatch(v => !v)}
                C={C}
                isDark={isDark}
              />
              {totalIssues === 0 && (
                <div style={{ background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.red, letterSpacing: "0.05em", marginBottom: 5 }}>OUT OF SYNC — NO DIFF DETAIL</div>
                  <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6 }}>The API reported this pair as out of sync but returned no specific entries.</div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="mf">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// Subnet Scroll Component
function SubnetScroll({ pairs, results, onCardClick, C }) {
  const gs = pairs.filter(p => results[p.id]?.data?.status === "IN SYNC").length;
  const gd = pairs.filter(p => results[p.id]?.data?.status === "NOT IN SYNC").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
          <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{gs} synced</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: gd > 0 ? C.red : C.borderMid }} />
          <span style={{ fontSize: 12, color: gd > 0 ? C.red : C.textMuted, fontWeight: 600 }}>{gd} drifted</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.borderMid }} />
          <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>{pairs.length} total</span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))", gap: 10, alignContent: "start" }}>
          {pairs.map(pair => (
            <ServerCard key={pair.id} pair={pair} result={results[pair.id]} onClick={onCardClick} C={C} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Boot Screen Component
function BootScreen({ status, error, onRetry, C }) {
  return (
    <div className="boot-screen" style={{ background: C.bg }}>
      <div style={{ width: 4, height: 44, borderRadius: 2, background: `linear-gradient(180deg,${C.accent},${C.accent}44)`, marginBottom: 4 }} />
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "0.1em", color: C.text }}>EIS SYNC PORTAL</div>
      <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", fontWeight: 500, marginBottom: 16 }}>PR / DR SYNCHRONIZATION MONITOR</div>
      {error ? (
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 10, padding: "16px 22px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, letterSpacing: "0.06em", marginBottom: 7 }}>⚠ Failed to Load Server List</div>
            <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65 }}>{error}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 7, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>
              {GET_ALL_IPS_URL}
            </div>
          </div>
          <button className="btn btn-primary" onClick={onRetry}>Retry</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Spinner size={30} color={C.accent} />
          <div style={{ fontSize: 13, color: C.textSub, fontWeight: 500 }}>{status}</div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const C = isDark ? DARK : LIGHT;

  // Apply CSS variables for theme
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(C).forEach(([key, value]) => {
      root.style.setProperty(`--${key}-color`, value);
    });
  }, [C]);

  const [pairs, setPairs] = useState(null);
  const [bootStatus, setBootStatus] = useState("Fetching server list…");
  const [bootError, setBootError] = useState(null);
  const [results, setResults] = useState({});
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [subnetIdx, setSubnetIdx] = useState(0);
  const [sliding, setSliding] = useState(false);
  const [slideDir, setSlideDir] = useState(1);
  const abortRef = useRef(null);

  const toggleTheme = () => {
    setIsTransitioning(true);
    setIsDark(v => !v);
    setTimeout(() => setIsTransitioning(false), 300);
  };

  const fetchServerList = useCallback(async () => {
    setBootError(null);
    setBootStatus("Fetching server list…");
    try {
      const res = await fetch(GET_ALL_IPS_URL, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
      const json = await res.json();
      const ips = (json.serverIps || []).map(o => o.serverIP).filter(Boolean);
      if (ips.length === 0) throw new Error("API returned an empty server list.");
      setBootStatus(`Building pairs from ${ips.length} servers…`);
      const built = buildPairs(ips);
      if (built.length === 0) throw new Error("No PR/DR pairs could be built from the returned IPs.");
      setPairs(built);
      runChecks(built);
    } catch (e) {
      setBootError(e.message);
    }
  }, []); // eslint-disable-line

  useEffect(() => { fetchServerList(); }, [fetchServerList]);

  const updateResult = useCallback((id, patch) => {
    setResults(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  async function checkPair(pair, signal) {
    updateResult(pair.id, { loading: true, error: null, data: null });
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip1: pair.pr, ip2: pair.dr }),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      updateResult(pair.id, { loading: false, data, timestamp: new Date().toLocaleString() });
    } catch (e) {
      if (e.name === "AbortError") return;
      updateResult(pair.id, { loading: false, error: e.message, timestamp: new Date().toLocaleString() });
    }
  }

  async function runChecks(pairList) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsRunning(true);
    const fresh = {};
    pairList.forEach(p => { fresh[p.id] = { loading: true }; });
    setResults(fresh);
    let idx = 0;
    async function worker() {
      while (idx < pairList.length && !ctrl.signal.aborted) {
        const pair = pairList[idx++];
        await checkPair(pair, ctrl.signal);
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    setIsRunning(false);
  }

  async function runAll() { if (pairs) await runChecks(pairs); }

  function stopAll() {
    abortRef.current?.abort();
    setIsRunning(false);
    setResults(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k]?.loading) next[k] = { ...next[k], loading: false, error: "Cancelled" };
      }
      return next;
    });
  }

  function slideToSubnet(idx) {
    if (idx === subnetIdx || sliding) return;
    setSlideDir(idx > subnetIdx ? 1 : -1);
    setSliding(true);
    setTimeout(() => { setSubnetIdx(idx); setSliding(false); }, 320);
  }

  if (!pairs) {
    return <BootScreen status={bootStatus} error={bootError} onRetry={fetchServerList} C={C} />;
  }

  const vals = Object.values(results);
  const total = pairs.length;
  const checked = vals.filter(r => r && !r.loading && (r.data || r.error)).length;
  const synced = vals.filter(r => r?.data?.status === "IN SYNC").length;
  const notSynced = vals.filter(r => r?.data?.status === "NOT IN SYNC").length;
  const errors = vals.filter(r => r?.error && !r.loading).length;
  const inProgress = vals.filter(r => r?.loading).length;

  function getFiltered(group) {
    return pairs.filter(p => {
      if (!p.pr.startsWith(group.prefix)) return false;
      const r = results[p.id];
      if (search) {
        const q = search.toLowerCase();
        if (!p.pr.includes(q) && !p.dr.includes(q) && !oct(p.pr).includes(q)) return false;
      }
      if (filter === "synced") return r?.data?.status === "IN SYNC";
      if (filter === "not-synced") return r?.data?.status === "NOT IN SYNC";
      if (filter === "error") return !!r?.error;
      if (filter === "pending") return !r || r.loading;
      return true;
    });
  }

  const activeGroup = GROUPS[subnetIdx];

  // Apply colors via inline styles or CSS custom properties
  const headerStyle = { background: C.headerBg, borderBottom: `1px solid ${C.border}` };
  const statsStyle = { background: C.surface, borderBottom: `1px solid ${C.border}` };
  const filtersStyle = { background: C.surface, borderBottom: `1px solid ${C.border}` };
  const carouselHeaderStyle = { background: C.headerBg, borderBottom: `1px solid ${C.border}` };

  return (
    <div className={isTransitioning ? "theme-transition" : ""} style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.bg }}>

      {/* ── Header ── */}
      <header style={{ ...headerStyle, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, flexShrink: 0, gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 4, height: 26, borderRadius: 2, background: `linear-gradient(180deg,${C.accent},${C.accent}44)` }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.08em", color: C.text }}>EIS SYNC PORTAL</div>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.07em", fontWeight: 500, marginTop: 1 }}>PR / DR SYNCHRONIZATION MONITOR</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>{pairs.length} pairs</span>
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          {checked > 0 && (
            <button className="btn btn-csv" style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.greenBorder}` }} onClick={() => downloadCSV(pairs, results)}>
              ↓ CSV
            </button>
          )}
          {isRunning
            ? <button className="btn btn-stop" style={{ background: C.redBg, color: C.red, border: `1px solid ${C.redBorder}` }} onClick={stopAll}>■ Stop</button>
            : <button className="btn btn-primary" style={{ background: C.accent, boxShadow: `0 2px 8px ${isDark ? "rgba(79,142,247,0.3)" : "rgba(37,99,235,0.25)"}` }} onClick={runAll}>▶ Check All</button>
          }
        </div>
      </header>

      {/* ── Stats row ── */}
      <div style={{ ...statsStyle, display: "flex", gap: 8, padding: "10px 22px", flexShrink: 0 }}>
        {[
          { label: "TOTAL", val: total, color: C.text },
          { label: "CHECKED", val: checked, color: C.accent, pct: total ? checked / total * 100 : 0, pc: C.accent },
          { label: "IN SYNC", val: synced, color: C.green, pct: checked ? synced / checked * 100 : 0, pc: C.green },
          { label: "OUT OF SYNC", val: notSynced, color: C.red, pct: checked ? notSynced / checked * 100 : 0, pc: C.red },
          { label: "ERRORS", val: errors, color: C.amber },
          { label: "IN PROGRESS", val: inProgress, color: C.textSub },
        ].map(s => (
          <div key={s.label} className="stat" style={{ background: C.statBg, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{s.val}</div>
            {s.pct !== undefined && <div className="pbar" style={{ background: C.border }}><div className="pfill" style={{ width: `${s.pct}%`, background: s.pc }} /></div>}
          </div>
        ))}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 5, marginLeft: "auto", flexShrink: 0, padding: "4px 8px" }}>
          {[
            { color: C.green, label: "In Sync" },
            { color: C.red, label: "Out of Sync" },
            { color: C.purple, label: "Prop Mismatch" },
            { color: C.amber, label: "Error" },
            { color: C.borderMid, label: "Pending" }
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, flexShrink: 0, boxShadow: l.color !== C.borderMid ? `0 0 6px ${l.color}` : "none" }} />
              <span style={{ fontSize: 11, color: C.textSub, whiteSpace: "nowrap", fontWeight: 500 }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filter / Search ── */}
      <div style={{ ...filtersStyle, display: "flex", gap: 8, padding: "9px 22px", flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="srch"
          style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text }}
          type="text"
          placeholder="Search IP or octet…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {[["all", "All"], ["synced", "In Sync"], ["not-synced", "Out of Sync"], ["error", "Error"], ["pending", "Pending"]].map(([v, l]) => (
            <button
              key={v}
              className={`fp${filter === v ? " on" : ""}`}
              style={filter === v ? { background: C.accent, borderColor: C.accent, color: "#fff" } : { color: C.textSub }}
              onClick={() => setFilter(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.textMuted, flexShrink: 0, fontWeight: 500 }}>
          {getFiltered(activeGroup).length} pairs shown — click any card for details
        </span>
      </div>

      {/* ── Subnet carousel header ── */}
      <div style={{ ...carouselHeaderStyle, display: "flex", alignItems: "center", gap: 0, padding: "0 22px", height: 50, flexShrink: 0 }}>
        <button className="car-btn" disabled={subnetIdx === 0 || sliding} onClick={() => slideToSubnet(subnetIdx - 1)} style={{ marginRight: 14 }}>
          ‹
        </button>
        <div style={{ flex: 1, overflow: "hidden", position: "relative", height: "100%", display: "flex", alignItems: "center" }}>
          <div style={{
            display: "flex",
            transform: sliding ? `translateX(${slideDir > 0 ? "-50px" : "50px"})` : "translateX(0)",
            opacity: sliding ? 0 : 1,
            transition: `transform 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.32s ease`,
            alignItems: "center", gap: 14,
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.accent, letterSpacing: "0.08em" }}>{activeGroup.label}</span>
            <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500, fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{activeGroup.sublabel}</span>
            <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>— {pairs.filter(p => p.pr.startsWith(activeGroup.prefix)).length} pairs</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 14 }}>
          {GROUPS.map((g, i) => (
            <button key={g.id} className={`subnet-dot ${i === subnetIdx ? "on" : "off"}`} style={i === subnetIdx ? { background: C.accent } : { background: C.borderMid }} onClick={() => slideToSubnet(i)} title={g.label} />
          ))}
        </div>
        <button className="car-btn" disabled={subnetIdx === GROUPS.length - 1 || sliding} onClick={() => slideToSubnet(subnetIdx + 1)}>
          ›
        </button>
      </div>

      {/* ── Carousel track ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative", background: C.bg }}>
        <div style={{
          display: "flex",
          width: `${GROUPS.length * 100}%`,
          height: "100%",
          transform: `translateX(${-subnetIdx * (100 / GROUPS.length)}%)`,
          transition: `transform 0.32s cubic-bezier(0.4,0,0.2,1)`,
        }}>
          {GROUPS.map((group) => {
            const fp = getFiltered(group);
            return (
              <div key={group.id} style={{ width: `${100 / GROUPS.length}%`, height: "100%", padding: "12px 22px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
                {fp.length > 0
                  ? <SubnetScroll
                    key={group.id + filter + search}
                    pairs={fp}
                    results={results}
                    onCardClick={(p, r) => {
                      if (!r) { checkPair(p, new AbortController().signal); return; }
                      setModal({ pair: p, result: r });
                    }}
                    C={C}
                  />
                  : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 14, fontWeight: 500 }}>
                    No servers match the current filter
                  </div>
                }
              </div>
            );
          })}
        </div>
      </div>

      {modal && (
        <DetailModal
          pair={modal.pair}
          result={modal.result}
          onClose={() => setModal(null)}
          C={C}
          isDark={isDark}
        />
      )}
    </div>
  );
}
