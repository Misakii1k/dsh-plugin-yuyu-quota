import { BalanceSnapshot } from './types.js';

/**
 * 原生制作的精细 SVG 矢量图标库 (Radix / Carbon 风格紧凑严谨网格，1.5px 笔触)
 */
export const ICONS = {
  wallet: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V7H4a2 2 0 0 1 0-4h16v4"/><path d="M2 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M17 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
  alert: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  refresh: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  fish: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6s-7.56-2.54-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .5 6.5-1.5 1.5-1.5 5-.5 6.5 2.85-.47 4.27-2.5 4.27-5.17v-2.66Z"/></svg>`,
  browser: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M2 8h20"/><circle cx="6" cy="6" r=".5" fill="currentColor"/></svg>`,
  check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  sparkle: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`
};

/**
 * Oil-UI 规范设计的 Web UI 状态栏胶囊与弹窗详情组件
 * 特点：
 * 1. 严格层级：大字等宽数字主角、次级信息后退、删减多余边框与装饰
 * 2. 动效手感：展开时 0.98->1 微缩放渐入，点击时 0.97 微阻尼反馈
 * 3. 完整交互：支持点击外部自收起、Esc关闭、同步旋转反馈、一键提取
 * 4. 纯净矢量：全原生 SVG，零依赖、自适应深色/浅色模式
 */
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderWidgetHtml(snapshot: BalanceSnapshot): string {
  const isAlert = snapshot.isLowBalance;
  const balanceInt = Math.floor(snapshot.balance);
  const balanceDec = (snapshot.balance - balanceInt).toFixed(2).substring(1); // .81
  const formattedBalance = snapshot.success ? `$${snapshot.balance.toFixed(2)}` : '未连接';
  const safeEmail = escapeHtml(snapshot.email || '未登录');

  const alertBadgeHtml = isAlert
    ? `<span style="display:inline-flex;align-items:center;color:#ef4444;margin-right:2px;" title="余额低于 $${snapshot.alertThreshold.toFixed(2)} 预警线">${ICONS.alert}</span>`
    : '';

  return `
<div id="yuyu-quota-root" style="position:relative;display:inline-flex;align-items:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;font-size:12px;line-height:1.4;">
  <style>
    #yuyu-quota-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px;
      border-radius: 9999px;
      background: var(--dsh-surface-1, #f4f5f7);
      color: var(--dsh-text-primary, #1e293b);
      border: 1px solid ${isAlert ? '#fca5a5' : 'var(--dsh-border, #e2e8f0)'};
      cursor: pointer;
      user-select: none;
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #yuyu-quota-pill:hover {
      background: var(--dsh-surface-2, #e8ebf0);
      transform: translateY(-1px);
      box-shadow: 0 2px 5px rgba(0,0,0,0.04);
    }
    #yuyu-quota-pill:active {
      transform: scale(0.97);
    }
    #yuyu-quota-modal {
      display: none;
      opacity: 0;
      transform: scale(0.98) translateY(4px);
      transition: opacity 0.16s ease, transform 0.16s ease;
      position: absolute;
      bottom: calc(100% + 8px);
      right: 0;
      width: 290px;
      background: var(--dsh-bg-card, #ffffff);
      color: var(--dsh-text-primary, #0f172a);
      border: 1px solid var(--dsh-border, #e2e8f0);
      border-radius: 12px;
      box-shadow: 0 10px 25px -4px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.03);
      padding: 14px 16px;
      z-index: 9999;
    }
    #yuyu-quota-modal.is-open {
      display: block;
      opacity: 1;
      transform: scale(1) translateY(0);
    }
    .yuyu-grid-cell {
      background: var(--dsh-surface-1, #f8fafc);
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .yuyu-btn-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border: 1px solid var(--dsh-border, #cbd5e1);
      background: var(--dsh-bg-card, #ffffff);
      color: var(--dsh-text-primary, #334155);
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      padding: 6px 10px;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .yuyu-btn-action:hover {
      background: var(--dsh-surface-1, #f1f5f9);
      border-color: #94a3b8;
    }
    .yuyu-btn-action:active {
      transform: scale(0.98);
    }
    @keyframes yuyu-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .yuyu-spinning {
      animation: yuyu-spin 0.75s linear infinite;
    }
  </style>

  <!-- 状态栏紧凑胶囊 -->
  <div id="yuyu-quota-pill" title="点击查看鱼鱼API资产详情">
    ${alertBadgeHtml}
    <span style="display:inline-flex;align-items:center;color:#64748b;">${ICONS.wallet}</span>
    <span style="font-weight:600;font-size:11px;letter-spacing:0.3px;color:#475569;">鱼鱼</span>
    <span style="color:${isAlert ? '#e11d48' : '#059669'};font-weight:700;font-variant-numeric:tabular-nums;font-size:12px;">${formattedBalance}</span>
  </div>

  <!-- 悬浮弹窗卡片 (严格层级与信息收敛) -->
  <div id="yuyu-quota-modal" role="dialog" aria-modal="true">
    <!-- 顶部标题与轻量动作 -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="display:inline-flex;color:#2563eb;">${ICONS.fish}</span>
        <span style="font-weight:600;font-size:12.5px;color:#0f172a;">鱼鱼 API</span>
      </div>
      <div style="display:flex;align-items:center;gap:3px;">
        <button id="yuyu-refresh-btn" class="yuyu-btn-action" style="padding:3px 6px;border-radius:4px;" title="刷新数据">
          <span class="yuyu-refresh-icon" style="display:inline-flex;">${ICONS.refresh}</span>
        </button>
      </div>
    </div>

    <!-- 视觉主角：当前账户余额主数字 -->
    <div style="margin-bottom:12px;padding:10px 12px;background:${isAlert ? '#fff1f2' : '#f0fdf4'};border:1px solid ${isAlert ? '#fecdd3' : '#bbf7d0'};border-radius:8px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span style="font-size:11px;color:${isAlert ? '#9f1239' : '#166534'};font-weight:500;">可用余额</span>
        <span style="font-size:10px;color:#64748b;font-variant-numeric:tabular-nums;">${safeEmail}</span>
      </div>
      <div style="margin-top:2px;display:flex;align-items:baseline;gap:2px;">
        <span style="font-size:14px;font-weight:600;color:${isAlert ? '#e11d48' : '#15803d'};">$</span>
        <span style="font-size:24px;font-weight:700;color:${isAlert ? '#e11d48' : '#15803d'};font-variant-numeric:tabular-nums;letter-spacing:-0.5px;">${snapshot.success ? `${balanceInt}${balanceDec}` : '0.00'}</span>
        ${isAlert ? `<span style="margin-left:auto;font-size:10px;color:#e11d48;font-weight:600;background:#ffe4e6;padding:1px 5px;border-radius:4px;">余额偏低</span>` : ''}
      </div>
    </div>

    <!-- 数据指标网格 (2x2 对齐布局，等宽数字) -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">
      <div class="yuyu-grid-cell">
        <span style="color:#64748b;font-size:10px;">实扣</span>
        <span style="font-weight:600;font-size:12px;color:#1e293b;font-variant-numeric:tabular-nums;">$${snapshot.todayCost.toFixed(4)}</span>
      </div>
      <div class="yuyu-grid-cell">
        <span style="color:#64748b;font-size:10px;">Tokens</span>
        <span style="font-weight:600;font-size:12px;color:#1e293b;font-variant-numeric:tabular-nums;">${snapshot.todayTokens.toLocaleString()}</span>
      </div>
      <div class="yuyu-grid-cell">
        <span style="color:#64748b;font-size:10px;">密钥</span>
        <span style="font-weight:600;font-size:12px;color:#1e293b;font-variant-numeric:tabular-nums;">${snapshot.keysCount} 个</span>
      </div>
      <div class="yuyu-grid-cell">
        <span style="color:#64748b;font-size:10px;">请求</span>
        <span style="font-weight:600;font-size:12px;color:#1e293b;font-variant-numeric:tabular-nums;">${snapshot.todayRequests} 次</span>
      </div>
    </div>

    <!-- 极简主动作：从浏览器同步账号 -->
    <div style="display:flex;flex-direction:column;gap:5px;">
      <button id="yuyu-auto-sync-btn" class="yuyu-btn-action" style="width:100%;padding:6px 0;">
        <span class="yuyu-sync-icon" style="display:inline-flex;">${ICONS.browser}</span>
        <span id="yuyu-sync-btn-text">从浏览器同步账号</span>
      </button>
      <div id="yuyu-sync-feedback" style="display:none;font-size:10px;text-align:center;padding:2px 0;"></div>
    </div>

    <!-- 底部状态小注 -->
    <div style="margin-top:8px;padding-top:6px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;">
      <span>已同步 ${new Date(snapshot.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      <span style="display:flex;align-items:center;gap:3px;"><span style="color:#10b981;">●</span> 本地直连</span>
    </div>
  </div>

  <!-- 客户端微交互驱动脚本 (单例安全、事件冒泡收拢) -->
  <script>
    (function() {
      const root = document.getElementById('yuyu-quota-root');
      if (!root || root.dataset.yuyuInitialized) return;
      root.dataset.yuyuInitialized = 'true';

      const pill = root.querySelector('#yuyu-quota-pill');
      const modal = root.querySelector('#yuyu-quota-modal');
      const refreshBtn = root.querySelector('#yuyu-refresh-btn');
      const syncBtn = root.querySelector('#yuyu-auto-sync-btn');
      const feedback = root.querySelector('#yuyu-sync-feedback');

      let isOpen = false;

      function toggleModal(open) {
        isOpen = open !== undefined ? open : !isOpen;
        if (isOpen) {
          modal.style.display = 'block';
          requestAnimationFrame(() => modal.classList.add('is-open'));
        } else {
          modal.classList.remove('is-open');
          setTimeout(() => { if (!isOpen) modal.style.display = 'none'; }, 160);
        }
      }

      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleModal();
      });

      modal.addEventListener('click', (e) => e.stopPropagation());

      document.addEventListener('click', () => {
        if (isOpen) toggleModal(false);
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) toggleModal(false);
      });

      // 刷新动画与操作
      if (refreshBtn) {
        refreshBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const icon = refreshBtn.querySelector('.yuyu-refresh-icon');
          if (icon) icon.classList.add('yuyu-spinning');
          try {
            const res = await fetch('/api/yuyu/sync', { method: 'POST' });
            setTimeout(() => {
              if (icon) icon.classList.remove('yuyu-spinning');
              window.location.reload();
            }, 600);
          } catch {
            if (icon) icon.classList.remove('yuyu-spinning');
          }
        });
      }

      // 一键同步按钮动作
      if (syncBtn) {
        syncBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const btnText = syncBtn.querySelector('#yuyu-sync-btn-text');
          const syncIcon = syncBtn.querySelector('.yuyu-sync-icon');
          syncBtn.disabled = true;
          if (btnText) btnText.textContent = '正在智能探测浏览器...';
          if (syncIcon) syncIcon.classList.add('yuyu-spinning');

          try {
            const res = await fetch('/api/yuyu/sync', { method: 'POST' });
            const data = await res.json();
            if (syncIcon) syncIcon.classList.remove('yuyu-spinning');
            syncBtn.disabled = false;

            if (data && data.success) {
              if (btnText) btnText.textContent = '同步成功！正在刷新...';
              feedback.style.display = 'block';
              feedback.style.color = '#059669';
              feedback.textContent = '[就绪] 已从 ' + (data.browser || '浏览器') + ' 提取凭据';
              setTimeout(() => window.location.reload(), 800);
            } else {
              if (btnText) btnText.textContent = '一键从浏览器同步登录凭证';
              feedback.style.display = 'block';
              feedback.style.color = '#b91c1c';
              feedback.textContent = (data && data.message) || '未检测到已登录的标签页，请先在浏览器中登录';
            }
          } catch (err) {
            if (syncIcon) syncIcon.classList.remove('yuyu-spinning');
            syncBtn.disabled = false;
            if (btnText) btnText.textContent = '一键从浏览器同步登录凭证';
            feedback.style.display = 'block';
            feedback.style.color = '#b91c1c';
            feedback.textContent = '同步请求异常，请检查本地网络';
          }
        });
      }
    })();
  </script>
</div>
`;
}
