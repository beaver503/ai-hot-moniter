/** SMTP 邮件通知（nodemailer） */
import nodemailer from 'nodemailer';
import { getSettings } from '../db.js';

export function mailConfigured() {
  const s = getSettings();
  return !!(s.mailHost && s.mailUser && s.mailPass && s.mailFrom && s.mailTo && s.mailEnabled);
}

function makeTransport() {
  const s = getSettings();
  return nodemailer.createTransport({
    host: s.mailHost,
    port: Number(s.mailPort) || 465,
    secure: !!s.mailSecure,
    auth: { user: s.mailUser, pass: s.mailPass },
  });
}

function fmtTime(unix) {
  return new Date(unix * 1000).toLocaleString('zh-CN', { hour12: false });
}

/** 新确认信号邮件（单条即时发送） */
export async function sendSignalMail({ word, title, url, source, summary, confidence, reason, publishedAt }) {
  if (!mailConfigured()) return { skipped: true, reason: 'mail not configured' };
  const s = getSettings();
  const transporter = makeTransport();
  const subject = `📡 雷达捕获 [${word}] ${title.slice(0, 60)}`;
  const html = `
  <div style="font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;max-width:640px;margin:0 auto;background:#0a0f16;color:#d8e2dc;border-radius:12px;overflow:hidden;border:1px solid #1d2b3a">
    <div style="background:linear-gradient(135deg,#06231a,#0a1626);padding:20px 24px;border-bottom:1px solid #1d2b3a">
      <div style="color:#00ff9d;font-size:13px;letter-spacing:2px">AI HOT RADAR · 新信号确认</div>
      <div style="font-size:20px;font-weight:700;margin-top:8px;color:#eef4f0">${escapeHtml(title)}</div>
    </div>
    <div style="padding:20px 24px">
      <table style="width:100%;font-size:13px;color:#9fb3a8;border-collapse:collapse">
        <tr><td style="padding:4px 0;width:90px;color:#5a7a6a">监控词</td><td style="color:#00ff9d;font-weight:600">${escapeHtml(word)}</td></tr>
        <tr><td style="padding:4px 0;color:#5a7a6a">AI 真实度</td><td style="color:#ffb800;font-weight:600">${confidence}%</td></tr>
        <tr><td style="padding:4px 0;color:#5a7a6a">判定理由</td><td>${escapeHtml(reason || '-')}</td></tr>
        <tr><td style="padding:4px 0;color:#5a7a6a">来源</td><td>${escapeHtml(source)} · ${publishedAt ? fmtTime(publishedAt) : '时间未知'}</td></tr>
      </table>
      <div style="margin:16px 0;padding:14px 16px;background:#0d1620;border-left:3px solid #00ff9d;border-radius:6px;font-size:14px;line-height:1.7;color:#c8d6cd">${escapeHtml(summary || '')}</div>
      <a href="${url}" style="display:inline-block;background:#00c07c;color:#04140c;text-decoration:none;font-weight:700;font-size:14px;padding:10px 22px;border-radius:8px">查看原文 →</a>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #1d2b3a;font-size:11px;color:#44584c">此邮件由 AI 热点雷达站自动发送 · AI 判定仅供参考，请以原文为准</div>
  </div>`;
  const info = await transporter.sendMail({ from: s.mailFrom, to: s.mailTo, subject, html });
  return { messageId: info.messageId };
}

/** 测试邮件（设置页用） */
export async function sendTestMail(overrideSettings = null) {
  let transporter;
  let to;
  if (overrideSettings) {
    to = overrideSettings.mailTo;
    transporter = nodemailer.createTransport({
      host: overrideSettings.mailHost,
      port: Number(overrideSettings.mailPort) || 465,
      secure: !!overrideSettings.mailSecure,
      auth: { user: overrideSettings.mailUser, pass: overrideSettings.mailPass },
    });
  } else {
    if (!mailConfigured()) return { ok: false, error: '邮件设置不完整或未启用' };
    const s = getSettings();
    to = s.mailTo;
    transporter = makeTransport();
  }
  const info = await transporter.sendMail({
    from: overrideSettings?.mailFrom || getSettings().mailFrom,
    to,
    subject: '📡 AI 热点雷达站 · 测试邮件',
    html: '<div style="font-family:sans-serif;padding:24px"><h2 style="color:#00a86b">✅ 通知通道正常</h2><p>如果你收到这封邮件，说明雷达站的邮件通知已配置成功。</p><p style="color:#888">AI Hot Radar</p></div>',
  });
  return { ok: true, messageId: info.messageId };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
