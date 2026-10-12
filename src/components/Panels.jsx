/** 监控词管理 + 设置面板 */
import * as React from "react";
import { api, timeAgo, fmtIn } from "@/hooks/useRadarState";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-edge bg-black/50 px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-signal/50 focus:shadow-[0_0_0_3px_rgba(0,230,138,0.08)]";

const labelCls = "font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint";

const btn =
  "rounded-lg border border-edge bg-white/[0.03] px-3.5 py-2 font-mono text-[12px] text-ink transition-all hover:border-signal/40 hover:text-signal disabled:opacity-40";

export function KeywordsPanel({ keywords, schedule, refresh, notify }) {
  const [word, setWord] = React.useState("");
  const [kind, setKind] = React.useState("monitor");
  const [interval, setIntervalMin] = React.useState(30);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!word.trim() || busy) return;
    setBusy(true);
    try {
      await api("/keywords", { method: "POST", body: { word, kind, interval_min: interval } });
      notify(`◉ 「${word}」已加入雷达，20~40 秒内完成首轮扫描`);
      setWord("");
      await refresh();
    } catch (err) {
      notify(err.message, "error");
    }
    setBusy(false);
  };

  const act = async (id, action) => {
    try {
      if (action === "scan") {
        await api(`/keywords/${id}/scan`, { method: "POST" });
        notify("⚡ 已触发扫描，AI 判定完成后信号实时推送");
      } else if (action === "del") {
        if (!confirm("确定删除该监控词？")) return;
        await api(`/keywords/${id}`, { method: "DELETE" });
      } else if (action === "toggle") {
        const kw = keywords.find((k) => String(k.id) === String(id));
        await api(`/keywords/${id}`, { method: "PATCH", body: { enabled: !kw.enabled } });
      }
      await refresh();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-white/[0.02] p-4">
        <div className="min-w-[220px] flex-1">
          <label className={labelCls}>关键词 / 领域</label>
          <input className={cn(inputCls, "mt-1.5")} value={word} onChange={(e) => setWord(e.target.value)}
            placeholder="如：GPT-5、Claude、AI 编程" maxLength={50} required />
        </div>
        <div className="w-[280px]">
          <label className={labelCls}>类型</label>
          <select className={cn(inputCls, "mt-1.5")} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="monitor">监控词 —— 精准盯梢，AI 验真后通知</option>
            <option value="domain">领域词 —— 定时聚合该领域热点榜</option>
          </select>
        </div>
        <div className="w-24">
          <label className={labelCls}>间隔(分)</label>
          <input type="number" min="5" max="1440" className={cn(inputCls, "mt-1.5")}
            value={interval} onChange={(e) => setIntervalMin(e.target.value)} />
        </div>
        <button className="rounded-lg bg-signal px-4 py-2 font-mono text-[12px] font-bold text-black transition-shadow hover:shadow-[0_0_20px_rgba(0,230,138,0.4)] disabled:opacity-40"
          disabled={busy}>
          ＋ 加入雷达
        </button>
      </form>

      <div className="flex flex-col gap-2.5">
        {!keywords.length && (
          <div className="py-16 text-center text-sm text-ink-dim">还没有监控目标 —— 添加监控词或领域词</div>
        )}
        {keywords.map((k) => {
          const sched = schedule.find((s) => s.keywordId === k.id);
          return (
            <div key={k.id}
              className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-edge bg-white/[0.02] px-4 py-3", !k.enabled && "opacity-50")}>
              <span className="text-[14px] font-medium text-ink">{k.word}</span>
              <span className={cn("rounded border px-2 py-0.5 font-mono text-[10px] tracking-widest",
                k.kind === "monitor" ? "border-signal/30 text-signal" : "border-domain/30 text-domain")}>
                {k.kind === "domain" ? "领域热点" : "精准监控"}
              </span>
              <span className="font-mono text-[11px] text-ink-dim">
                确认 <b className="text-signal">{k.confirmed_count || 0}</b> · 疑似{" "}
                <b className="text-heat">{k.suspect_count || 0}</b>
                {k.kind === "monitor" ? ` · 每 ${k.interval_min} 分` : " · 跟随全局"}
                {k.last_scan_at ? ` · 上次 ${timeAgo(k.last_scan_at)}` : " · 未扫描"}
                {sched ? ` · 下次 ${fmtIn(sched.inSec)}` : ""}
              </span>
              <span className="ml-auto flex gap-2">
                <button className={btn} onClick={() => act(k.id, "scan")}>⚡ 立即扫描</button>
                <button className={btn} onClick={() => act(k.id, "toggle")}>{k.enabled ? "⏸ 暂停" : "▶ 启用"}</button>
                <button className={cn(btn, "hover:border-critical/40 hover:text-critical")} onClick={() => act(k.id, "del")}>删除</button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsPanel({ notify, onSaved }) {
  const [settings, setSettings] = React.useState(null);
  const [orKeySet, setOrKeySet] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    api("/settings").then((d) => {
      setSettings(d.settings);
      setOrKeySet(d.openrouterKeySet);
    }).catch(() => {});
  }, []);

  if (!settings) return <div className="py-16 text-center text-sm text-ink-dim">载入中…</div>;

  const set = (name, value) => setSettings((s) => ({ ...s, [name]: value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...settings };
      if (body.mailPass === "********") delete body.mailPass;
      await api("/settings", { method: "PUT", body });
      notify("✓ 设置已保存，调度已重排");
      onSaved?.();
    } catch (err) {
      notify(err.message, "error");
    }
    setSaving(false);
  };

  const testMail = async () => {
    const body = {};
    for (const k of ["mailHost", "mailPort", "mailSecure", "mailUser", "mailPass", "mailFrom", "mailTo"]) {
      body[k] = k === "mailSecure" ? 1 : settings[k];
    }
    body.mailEnabled = 1;
    if (body.mailPass === "********") delete body.mailPass;
    try {
      const r = await api("/settings/test-mail", { method: "POST", body });
      r.ok || r.messageId ? notify("✉ 测试邮件已发送，请查收") : notify(r.error || "发送失败", "error");
    } catch (e) { notify(e.message, "error"); }
  };

  return (
    <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-edge bg-white/[0.02] p-5 md:col-span-1">
        <h3 className="mb-4 font-mono text-[12px] tracking-[0.2em] text-ink">🤖 AI 判定</h3>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>OpenRouter 模型</label>
            <input className={cn(inputCls, "mt-1.5")} value={settings.aiModel}
              onChange={(e) => set("aiModel", e.target.value)} />
            <p className={cn("mt-1.5 font-mono text-[10px]", orKeySet ? "text-signal" : "text-heat")}>
              {orKeySet ? "✓ OPENROUTER_API_KEY 已通过 .env 配置" : "⚠ .env 未配置 OPENROUTER_API_KEY（AI 判定暂停）"}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>确认阈值(≥通知)</label>
              <input type="number" className={cn(inputCls, "mt-1.5")} value={settings.confidenceThreshold}
                onChange={(e) => set("confidenceThreshold", e.target.value)} />
            </div>
            <div className="flex-1">
              <label className={labelCls}>疑似阈值(≥入库)</label>
              <input type="number" className={cn(inputCls, "mt-1.5")} value={settings.suspectThreshold}
                onChange={(e) => set("suspectThreshold", e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-white/[0.02] p-5">
        <h3 className="mb-4 font-mono text-[12px] tracking-[0.2em] text-ink">⏱ 扫描节奏</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls}>监控间隔(分)</label>
            <input type="number" className={cn(inputCls, "mt-1.5")} value={settings.keywordIntervalMin}
              onChange={(e) => set("keywordIntervalMin", e.target.value)} />
          </div>
          <div className="flex-1">
            <label className={labelCls}>热点间隔(分)</label>
            <input type="number" className={cn(inputCls, "mt-1.5")} value={settings.hotspotIntervalMin}
              onChange={(e) => set("hotspotIntervalMin", e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-5">
          <label className="flex items-center gap-2 font-mono text-[11px] text-ink-dim">
            <input type="checkbox" className="accent-[#00e68a]" checked={!!settings.providerFirecrawl}
              onChange={(e) => set("providerFirecrawl", e.target.checked ? 1 : 0)} /> Firecrawl
          </label>
          <label className="flex items-center gap-2 font-mono text-[11px] text-ink-dim">
            <input type="checkbox" className="accent-[#00e68a]" checked={!!settings.providerHackernews}
              onChange={(e) => set("providerHackernews", e.target.checked ? 1 : 0)} /> Hacker News
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-white/[0.02] p-5 md:col-span-2">
        <h3 className="mb-4 font-mono text-[12px] tracking-[0.2em] text-ink">📮 邮件通知 (SMTP)</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className={labelCls}>SMTP 服务器</label>
            <input className={cn(inputCls, "mt-1.5")} value={settings.mailHost} placeholder="smtp.qq.com"
              onChange={(e) => set("mailHost", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>端口</label>
            <input type="number" className={cn(inputCls, "mt-1.5")} value={settings.mailPort}
              onChange={(e) => set("mailPort", e.target.value)} />
          </div>
          <label className="flex items-end gap-2 pb-2.5 font-mono text-[11px] text-ink-dim">
            <input type="checkbox" className="accent-[#00e68a]" checked={!!settings.mailSecure}
              onChange={(e) => set("mailSecure", e.target.checked ? 1 : 0)} /> SSL
          </label>
          <div className="md:col-span-2">
            <label className={labelCls}>账号</label>
            <input className={cn(inputCls, "mt-1.5")} value={settings.mailUser} placeholder="you@qq.com"
              onChange={(e) => set("mailUser", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>授权码/密码</label>
            <input type="password" className={cn(inputCls, "mt-1.5")} value={settings.mailPass}
              onChange={(e) => set("mailPass", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>发件人</label>
            <input className={cn(inputCls, "mt-1.5")} value={settings.mailFrom} placeholder="雷达站 <you@qq.com>"
              onChange={(e) => set("mailFrom", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>收件人</label>
            <input className={cn(inputCls, "mt-1.5")} value={settings.mailTo} placeholder="you@qq.com"
              onChange={(e) => set("mailTo", e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <label className="flex items-center gap-2 font-mono text-[12px] text-ink">
            <input type="checkbox" className="accent-[#00e68a]" checked={!!settings.mailEnabled}
              onChange={(e) => set("mailEnabled", e.target.checked ? 1 : 0)} /> 启用邮件通知
          </label>
          <button type="button" className={btn} onClick={testMail}>发送测试邮件</button>
        </div>
      </div>

      <div className="md:col-span-2">
        <button type="submit" disabled={saving}
          className="rounded-lg bg-signal px-5 py-2.5 font-mono text-[12px] font-bold text-black transition-shadow hover:shadow-[0_0_20px_rgba(0,230,138,0.4)] disabled:opacity-40">
          {saving ? "保存中…" : "保存设置"}
        </button>
      </div>
    </form>
  );
}
