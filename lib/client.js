// DeepSeek Harness Client Extension for 鱼鱼API
// 规范：Oil UI 0.25.0 + 纯原生矢量 SVG (零 Emoji) + 多账号秒切 + 本地 LevelDB 无感同步 (零 MCP 依赖)
(function() {
  var PLUGIN_ID = 'dsh-plugin-yuyu-quota';
  var STORAGE_KEY = 'dsh_yuyu_multi_store_v1';
  var BRIDGE_BASE = 'http://127.0.0.1:53788/yuyu-quota/api';

  var SVG_WALLET = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V7H4a2 2 0 0 1 0-4h16v4"/><path d="M2 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M17 12a2 2 0 0 0 0 4h4v-4Z"/></svg>';
  var SVG_FISH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6s-7.56-2.54-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .5 6.5-1.5 1.5-1.5 5-.5 6.5 2.85-.47 4.27-2.5 4.27-5.17v-2.66Z"/></svg>';
  var SVG_REFRESH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>';
  var SVG_BROWSER = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M2 8h20"/><circle cx="6" cy="6" r=".5" fill="currentColor"/></svg>';
  var SVG_CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  var SVG_CLOSE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function sameOriginApi(subPath) {
    var rel = 'yuyu-quota/api' + (subPath.charAt(0) === '/' ? subPath : '/' + subPath);
    if (typeof document === 'undefined') return '/' + rel;
    try {
      return new URL(rel, document.baseURI).pathname + (subPath.indexOf('?') >= 0 ? subPath.slice(subPath.indexOf('?')) : '');
    } catch (e) {
      return '/' + rel;
    }
  }

  // 双通道请求器：优先请求本地免重启桥接服务 (127.0.0.1:53788)，回退 DSH 同源 webServer
  function requestBackend(subPath, options) {
    var bridgeUrl = BRIDGE_BASE + (subPath.charAt(0) === '/' ? subPath : '/' + subPath);
    var hostUrl = sameOriginApi(subPath);
    var opts = Object.assign({ cache: 'no-store' }, options || {});

    return fetch(bridgeUrl, opts)
      .then(function(res) {
        if (!res.ok) throw new Error('Bridge HTTP ' + res.status);
        return res.json();
      })
      .catch(function() {
        return fetch(hostUrl, opts).then(function(res) {
          if (!res.ok) throw new Error('Host HTTP ' + res.status);
          return res.json();
        });
      });
  }

  var initialAccounts = [
    {
      email: '878503820@qq.com',
      balance: 7.02031123,
      active: true,
      snapshot: {
        success: true,
        email: '878503820@qq.com',
        balance: 7.02031123,
        totalRecharged: 13.90,
        todayCost: 0.0000,
        todayRawCost: 0.0000,
        todayTokens: 0,
        keysCount: 2,
        todayRequests: 0,
        totalRequests: 0,
        totalActualCost: 0.0000
      }
    },
    {
      email: '3231640018@qq.com',
      balance: 8.80628301,
      active: false,
      snapshot: {
        success: true,
        email: '3231640018@qq.com',
        balance: 8.80628301,
        totalRecharged: 48.00,
        todayCost: 0.0038398176,
        todayRawCost: 0.06399696,
        todayTokens: 32444,
        keysCount: 4,
        todayRequests: 4,
        totalRequests: 2391,
        totalActualCost: 3.3544474473
      }
    }
  ];

  var tokenStore = {
    activeEmail: '878503820@qq.com',
    email: '878503820@qq.com',
    balance: 7.02031123,
    totalRecharged: 13.90,
    todayCost: 0.0000,
    todayRawCost: 0.0000,
    todayTokens: 0,
    keysCount: 2,
    todayRequests: 0,
    totalRequests: 0,
    totalActualCost: 0.0000,
    alertThreshold: 2.0,
    accounts: initialAccounts,
    lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };

  // 尝试从 localStorage 恢复上次选中的状态
  try {
    var cachedRaw = window.localStorage.getItem(STORAGE_KEY);
    if (cachedRaw) {
      var parsed = JSON.parse(cachedRaw);
      if (parsed && parsed.activeEmail && Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
        tokenStore.activeEmail = parsed.activeEmail;
        tokenStore.accounts = parsed.accounts;
        var activeItem = parsed.accounts.find(function(a) { return a.email === parsed.activeEmail; }) || parsed.accounts[0];
        if (activeItem && activeItem.snapshot) {
          applySnapshotFields(activeItem.snapshot);
        }
      }
    }
  } catch (e) {}

  function saveClientStore() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        activeEmail: tokenStore.activeEmail,
        accounts: tokenStore.accounts
      }));
    } catch (e) {}
  }

  function applySnapshotFields(snap) {
    if (!snap) return;
    if (snap.email) tokenStore.email = snap.email;
    if (typeof snap.balance === 'number') tokenStore.balance = snap.balance;
    if (typeof snap.totalRecharged === 'number') tokenStore.totalRecharged = snap.totalRecharged;
    if (typeof snap.todayCost === 'number') tokenStore.todayCost = snap.todayCost;
    if (typeof snap.todayRawCost === 'number') tokenStore.todayRawCost = snap.todayRawCost;
    if (typeof snap.todayTokens === 'number') tokenStore.todayTokens = snap.todayTokens;
    if (typeof snap.todayRequests === 'number') tokenStore.todayRequests = snap.todayRequests;
    if (typeof snap.keysCount === 'number') tokenStore.keysCount = snap.keysCount;
    if (typeof snap.totalRequests === 'number') tokenStore.totalRequests = snap.totalRequests;
    if (typeof snap.totalActualCost === 'number') tokenStore.totalActualCost = snap.totalActualCost;
  }

  function applyBackendPayload(body) {
    if (!body) return false;
    if (Array.isArray(body.accounts) && body.accounts.length > 0) {
      tokenStore.accounts = body.accounts;
    }
    if (body.activeEmail) {
      tokenStore.activeEmail = body.activeEmail;
    }
    if (body.snapshot && body.snapshot.success) {
      applySnapshotFields(body.snapshot);
    } else {
      var found = tokenStore.accounts.find(function(a) { return a.email === tokenStore.activeEmail; }) || tokenStore.accounts[0];
      if (found) {
        tokenStore.email = found.email;
        tokenStore.balance = Number(found.balance || 0);
        if (found.snapshot) applySnapshotFields(found.snapshot);
      }
    }
    tokenStore.lastSync = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    saveClientStore();
    updateUI();
    notifyListeners();
    return true;
  }

  var listeners = [];
  function notifyListeners() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](Object.assign({}, tokenStore)); } catch(e) {}
    }
  }

  // 查询或同步数据
  function fetchRemoteBalance(callback, options) {
    var opts = options || {};
    var promise;

    if (opts.action === 'sync') {
      promise = requestBackend('/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          forceCapture: Boolean(opts.forceCapture),
          token: opts.token || undefined
        })
      });
    } else if (opts.action === 'switch' && opts.email) {
      // 先在本地秒切 UI（零延迟响应），再请求后端刷新最新值
      var localTarget = tokenStore.accounts.find(function(a) { return a.email === opts.email; });
      if (localTarget) {
        tokenStore.activeEmail = localTarget.email;
        tokenStore.accounts.forEach(function(a) { a.active = (a.email === localTarget.email); });
        if (localTarget.snapshot) applySnapshotFields(localTarget.snapshot);
        else {
          tokenStore.email = localTarget.email;
          tokenStore.balance = Number(localTarget.balance || 0);
        }
        saveClientStore();
        updateUI();
        notifyListeners();
      }
      promise = requestBackend('/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: opts.email })
      });
    } else if (opts.action === 'remove' && opts.email) {
      promise = requestBackend('/remove', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: opts.email })
      });
    } else {
      var query = opts.syncBrowser ? '?syncBrowser=1' : '?syncBrowser=0';
      promise = requestBackend('/snapshot' + query, { method: 'GET' });
    }

    promise
      .then(function(body) {
        applyBackendPayload(body);
        if (callback) callback(tokenStore, null, body && body.message);
      })
      .catch(function() {
        tokenStore.lastSync = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        updateUI();
        notifyListeners();
        if (callback) callback(tokenStore, null, '已切换至 ' + tokenStore.email + ' ($' + tokenStore.balance.toFixed(2) + ')');
      });
  }

  // 渲染卡片内的多账号紧凑切换栏 (头像胶囊流)
  function renderAccountSwitcherDOM() {
    var rowEl = document.getElementById('yuyu-avatars-row');
    if (!rowEl) return;

    rowEl.innerHTML = '';
    var accounts = tokenStore.accounts || [];

    accounts.forEach(function(acc) {
      var isActive = acc.email === tokenStore.activeEmail;
      var chip = document.createElement('div');
      chip.title = acc.email + ' ($' + Number(acc.balance || 0).toFixed(2) + ')';
      chip.style.cssText = [
        'display:flex;align-items:center;gap:5px;padding:3px 8px 3px 4px;border-radius:20px;cursor:pointer;transition:all 0.16s ease;font-size:11px;',
        isActive
          ? 'background:#eff6ff;border:1px solid #93c5fd;color:#1d4ed8;box-shadow:0 0 0 2px rgba(37,99,235,0.12);'
          : 'background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;'
      ].join('');

      var initial = (acc.email || '').replace(/@.*/, '').slice(0, 2).toUpperCase() || 'ID';
      var circle = document.createElement('span');
      circle.style.cssText = 'width:17px;height:17px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;' +
        (isActive ? 'background:#2563eb;color:#ffffff;' : 'background:#94a3b8;color:#ffffff;');
      circle.textContent = initial;

      var balSpan = document.createElement('span');
      balSpan.style.cssText = 'font-variant-numeric:tabular-nums;font-weight:600;';
      var balNum = typeof acc.balance === 'number' ? acc.balance : (acc.snapshot ? acc.snapshot.balance : 0);
      balSpan.textContent = '$' + Number(balNum || 0).toFixed(2);

      chip.appendChild(circle);
      chip.appendChild(balSpan);

      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        if (acc.email === tokenStore.activeEmail) return;
        fetchRemoteBalance(function(d, _err, msg) {
          showTip(msg || ('已切换至 ' + d.email));
        }, { action: 'switch', email: acc.email });
      });

      rowEl.appendChild(chip);
    });
  }

  function showTip(text, isError) {
    var tip = document.getElementById('yuyu-sync-tip');
    if (!tip) return;
    tip.style.display = 'block';
    tip.style.color = isError ? '#b91c1c' : '#059669';
    tip.style.background = isError ? '#fef2f2' : '#f0fdf4';
    tip.textContent = text;
    if (window.__yuyuTipTimer) clearTimeout(window.__yuyuTipTimer);
    window.__yuyuTipTimer = setTimeout(function() {
      tip.style.display = 'none';
    }, 3000);
  }

  // 刷新 DOM 显示
  function updateUI() {
    var isLow = tokenStore.balance <= tokenStore.alertThreshold;
    var pillVal = document.getElementById('yuyu-pill-val');
    var cardBal = document.getElementById('yuyu-card-bal');
    var cardRecharge = document.getElementById('yuyu-card-recharge');
    var cardCost = document.getElementById('yuyu-card-cost');
    var cardTokens = document.getElementById('yuyu-card-tokens');
    var cardKeys = document.getElementById('yuyu-card-keys');
    var syncTime = document.getElementById('yuyu-sync-time');

    if (pillVal) {
      pillVal.textContent = '$' + tokenStore.balance.toFixed(2);
      pillVal.style.color = isLow ? '#e11d48' : '#059669';
    }
    if (cardBal) cardBal.textContent = tokenStore.balance.toFixed(2);
    if (cardRecharge) cardRecharge.textContent = '累计充值 $' + tokenStore.totalRecharged.toFixed(2);
    if (cardCost) cardCost.textContent = '$' + tokenStore.todayCost.toFixed(4);
    if (cardTokens) cardTokens.textContent = tokenStore.todayTokens.toLocaleString();
    if (cardKeys) cardKeys.textContent = tokenStore.keysCount + ' 个';
    if (syncTime) syncTime.textContent = '已同步 ' + tokenStore.lastSync;

    renderAccountSwitcherDOM();
  }

  // DOM 悬浮胶囊注入
  function mountDOMWidget() {
    var existing = document.getElementById('yuyu-quota-floating-container');
    if (existing) {
      existing.remove();
    }

    var container = document.createElement('div');
    container.id = 'yuyu-quota-floating-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:28px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;font-size:12px;user-select:none;pointer-events:auto;';

    var html = [
      '<div id="yuyu-pill-btn" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:9999px;background:#ffffff;color:#1e293b;border:1px solid #e2e8f0;box-shadow:0 4px 14px rgba(0,0,0,0.06);cursor:pointer;transition:transform 0.15s ease, box-shadow 0.15s ease;">',
      '  <span style="display:inline-flex;color:#475569;">' + SVG_WALLET + '</span>',
      '  <span style="font-weight:600;font-size:11px;color:#475569;letter-spacing:0.2px;">鱼鱼</span>',
      '  <span id="yuyu-pill-val" style="color:#059669;font-weight:700;font-variant-numeric:tabular-nums;font-size:12.5px;">$' + tokenStore.balance.toFixed(2) + '</span>',
      '</div>',
      '<div id="yuyu-card-popup" style="display:none;position:absolute;bottom:46px;right:0;width:336px;background:rgba(255,255,255,0.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(226,232,240,0.9);border-radius:16px;box-shadow:0 16px 36px -4px rgba(15,23,42,0.12),0 4px 12px rgba(15,23,42,0.04);padding:16px 18px;color:#0f172a;box-sizing:border-box;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
      '    <div style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#0f172a;">',
      '      <div style="width:24px;height:24px;border-radius:6px;background:#eff6ff;border:1px solid #dbeafe;display:flex;align-items:center;justify-content:center;color:#2563eb;">' + SVG_FISH + '</div>',
      '      <span>鱼鱼 API</span>',
      '    </div>',
      '    <div style="display:flex;align-items:center;gap:6px;">',
      '      <div id="yuyu-avatars-row" style="display:flex;gap:5px;"></div>',
      '      <button id="yuyu-card-refresh" style="background:#f8fafc;border:1px solid #e2e8f0;cursor:pointer;padding:4px;color:#64748b;display:inline-flex;border-radius:5px;transition:all 0.15s;" title="刷新数据">' + SVG_REFRESH + '</button>',
      '    </div>',
      '  </div>',
      '  <div style="text-align:center;padding:4px 0 6px 0;">',
      '    <div style="font-size:11px;color:#64748b;margin-bottom:2px;">可用余额</div>',
      '    <div style="font-size:34px;font-weight:800;color:#0f172a;letter-spacing:-1px;line-height:1.1;font-variant-numeric:tabular-nums;">$<span id="yuyu-card-bal">' + tokenStore.balance.toFixed(2) + '</span></div>',
      '    <div style="margin-top:5px;"><span id="yuyu-card-recharge" style="display:inline-flex;align-items:center;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;font-size:10.5px;padding:2px 8px;border-radius:12px;font-weight:500;font-variant-numeric:tabular-nums;">累计充值 $' + tokenStore.totalRecharged.toFixed(2) + '</span></div>',
      '  </div>',
      '  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;margin:10px 0;display:flex;flex-direction:column;gap:8px;">',
      '    <div id="yuyu-drawer-toggle" style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600;color:#334155;cursor:pointer;">',
      '      <span>今日用量</span>',
      '      <span id="yuyu-drawer-arrow" style="display:inline-flex;color:#64748b;transition:transform 0.2s ease;">' + SVG_CHEVRON + '</span>',
      '    </div>',
      '    <div id="yuyu-drawer-content" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;border-top:1px dashed #e2e8f0;padding-top:7px;">',
      '      <div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:10px;color:#64748b;">实扣</span><span id="yuyu-card-cost" style="font-size:11.5px;font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums;">$' + tokenStore.todayCost.toFixed(4) + '</span></div>',
      '      <div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:10px;color:#64748b;">Tokens</span><span id="yuyu-card-tokens" style="font-size:11.5px;font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums;">' + tokenStore.todayTokens.toLocaleString() + '</span></div>',
      '      <div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:10px;color:#64748b;">密钥</span><span id="yuyu-card-keys" style="font-size:11.5px;font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums;">' + tokenStore.keysCount + ' 个</span></div>',
      '    </div>',
      '  </div>',
      '  <button id="yuyu-card-sync" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 0;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:11.5px;font-weight:500;color:#334155;transition:all 0.15s ease;">',
      '    <span style="display:inline-flex;">' + SVG_BROWSER + '</span>',
      '    <span id="yuyu-sync-label">从浏览器同步账号</span>',
      '  </button>',
      '  <div id="yuyu-sync-tip" style="display:none;font-size:10.5px;text-align:center;margin-top:6px;padding:4px 6px;border-radius:4px;background:#f0fdf4;color:#059669;"></div>',
      '  <div style="margin-top:10px;padding-top:6px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#94a3b8;">',
      '    <span id="yuyu-sync-time">已同步 ' + tokenStore.lastSync + '</span>',
      '    <span style="display:inline-flex;align-items:center;gap:4px;color:#10b981;font-weight:500;"><span style="width:5px;height:5px;border-radius:50%;background:#10b981;"></span><span>本地直连</span></span>',
      '  </div>',
      '</div>'
    ].join('\n');

    container.innerHTML = html;
    document.body.appendChild(container);
    updateUI();

    var pill = container.querySelector('#yuyu-pill-btn');
    var card = container.querySelector('#yuyu-card-popup');
    var syncBtn = container.querySelector('#yuyu-card-sync');
    var refreshBtn = container.querySelector('#yuyu-card-refresh');
    var syncLabel = container.querySelector('#yuyu-sync-label');
    var drawerToggle = container.querySelector('#yuyu-drawer-toggle');
    var drawerContent = container.querySelector('#yuyu-drawer-content');
    var drawerArrow = container.querySelector('#yuyu-drawer-arrow');

    var isDrawerOpen = true;
    drawerToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      isDrawerOpen = !isDrawerOpen;
      drawerContent.style.display = isDrawerOpen ? 'grid' : 'none';
      drawerArrow.style.transform = isDrawerOpen ? 'none' : 'rotate(-90deg)';
    });

    pill.addEventListener('mouseenter', function() {
      pill.style.transform = 'translateY(-1px)';
      pill.style.boxShadow = '0 6px 18px rgba(0,0,0,0.1)';
    });
    pill.addEventListener('mouseleave', function() {
      pill.style.transform = 'none';
      pill.style.boxShadow = '0 4px 14px rgba(0,0,0,0.06)';
    });

    var isOpen = false;
    pill.addEventListener('click', function(e) {
      e.stopPropagation();
      isOpen = !isOpen;
      card.style.display = isOpen ? 'block' : 'none';
      if (isOpen) {
        fetchRemoteBalance(null, { syncBrowser: true });
      }
    });

    card.addEventListener('click', function(e) { e.stopPropagation(); });
    document.addEventListener('click', function() {
      if (isOpen) {
        isOpen = false;
        card.style.display = 'none';
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) {
        isOpen = false;
        card.style.display = 'none';
      }
    });

    // 刷新按钮
    refreshBtn.addEventListener('click', function() {
      refreshBtn.style.transform = 'rotate(360deg)';
      refreshBtn.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
      setTimeout(function() {
        refreshBtn.style.transform = 'none';
        refreshBtn.style.transition = 'none';
      }, 600);
      fetchRemoteBalance(function(data) {
        showTip('已刷新 ' + data.email + ' ($' + data.balance.toFixed(2) + ')');
      }, { syncBrowser: false });
    });

    // 同步按钮
    syncBtn.addEventListener('click', function() {
      syncLabel.textContent = '正在同步...';
      syncBtn.disabled = true;
      fetchRemoteBalance(function(data, _err, msg) {
        syncBtn.disabled = false;
        syncLabel.textContent = '从浏览器同步账号';
        showTip(msg || ('已同步账号: ' + data.email + ' ($' + data.balance.toFixed(2) + ')'));
      }, { action: 'sync', forceCapture: false });
    });

    // 首次挂载立即检测一次浏览器最新账号，随后每 3 分钟定时刷新当前选中账号
    fetchRemoteBalance(null, { syncBrowser: true });
    if (window.__yuyuQuotaTimer) {
      clearInterval(window.__yuyuQuotaTimer);
    }
    window.__yuyuQuotaTimer = setInterval(function() {
      fetchRemoteBalance(null, { syncBrowser: false });
    }, 3 * 60 * 1000);
  }

  // 模块工厂函数
  function factory(require) {
    var react = null;
    try { react = require('react'); } catch(e) { react = window.React; }

    function YuyuReactComponent() {
      if (!react) return null;
      react.useEffect(function() {
        mountDOMWidget();
      }, []);
      return react.createElement('div', { id: 'yuyu-quota-mount-point' });
    }

    function YuyuSettingsSection() {
      if (!react) return null;
      var storeState = react.useState(Object.assign({}, tokenStore));
      var snap = storeState[0];
      var setSnap = storeState[1];

      var tokenInputState = react.useState('');
      var tokenDraft = tokenInputState[0];
      var setTokenDraft = tokenInputState[1];

      var msgState = react.useState('');
      var statusMsg = msgState[0];
      var setStatusMsg = msgState[1];

      react.useEffect(function() {
        var handler = function(newStore) {
          setSnap(newStore);
        };
        listeners.push(handler);
        fetchRemoteBalance(null, { syncBrowser: true });
        return function() {
          var idx = listeners.indexOf(handler);
          if (idx !== -1) listeners.splice(idx, 1);
        };
      }, []);

      function handleSyncBrowser() {
        setStatusMsg('正在从本地浏览器存储读取最新登录账号...');
        fetchRemoteBalance(function(data, _err, msg) {
          setStatusMsg(msg || ('已同步: ' + data.email + ' ($' + data.balance.toFixed(2) + ')'));
        }, { action: 'sync' });
      }

      function handleAddManualToken() {
        var clean = tokenDraft ? tokenDraft.trim() : '';
        if (!clean) return;
        setStatusMsg('正在验证 Token...');
        fetchRemoteBalance(function(data, _err, msg) {
          setTokenDraft('');
          setStatusMsg(msg || ('已添加并切换至: ' + data.email));
        }, { action: 'sync', token: clean });
      }

      return react.createElement('div', {
        style: {
          padding: '24px',
          maxWidth: '620px',
          fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC",sans-serif',
          color: 'var(--dsh-color-text, #0f172a)'
        }
      }, [
        react.createElement('div', {
          key: 'header',
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }
        }, [
          react.createElement('div', {
            key: 'title-wrap',
            style: { display: 'flex', alignItems: 'center', gap: '8px' }
          }, [
            react.createElement('span', {
              key: 'icon',
              style: { color: '#2563eb', display: 'inline-flex' },
              dangerouslySetInnerHTML: { __html: SVG_FISH }
            }),
            react.createElement('h2', {
              key: 'title',
              style: { margin: 0, fontSize: '18px', fontWeight: 600 }
            }, '鱼鱼API 多账号资产监控')
          ]),
          react.createElement('button', {
            key: 'sync-btn',
            onClick: handleSyncBrowser,
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer'
            }
          }, '从浏览器同步当前账号')
        ]),
        react.createElement('div', {
          key: 'acc-list',
          style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }
        }, (snap.accounts || []).map(function(acc) {
          var isAct = acc.email === snap.activeEmail;
          return react.createElement('div', {
            key: acc.email,
            onClick: function() {
              fetchRemoteBalance(null, { action: 'switch', email: acc.email });
            },
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              background: isAct ? '#ecfdf5' : '#f8fafc',
              border: isAct ? '1px solid #6ee7b7' : '1px solid #e2e8f0',
              fontWeight: isAct ? 600 : 500,
              fontSize: '13px'
            }
          }, [
            react.createElement('span', { key: 'e', style: { color: isAct ? '#065f46' : '#334155' } }, (isAct ? '● ' : '○ ') + acc.email),
            react.createElement('span', { key: 'b', style: { color: '#059669', fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }, '$' + Number(acc.balance || 0).toFixed(2))
          ]);
        })),
        react.createElement('div', {
          key: 'bal-box',
          style: {
            padding: '16px 20px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '10px',
            marginBottom: '14px'
          }
        }, [
          react.createElement('div', {
            key: 'bal-label',
            style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#166534', fontWeight: 500 }
          }, [
            react.createElement('span', { key: 'l' }, '当前选中账号可用余额'),
            react.createElement('span', { key: 'r', style: { color: '#15803d', fontWeight: 600 } }, snap.email)
          ]),
          react.createElement('div', {
            key: 'bal-val',
            style: { fontSize: '32px', fontWeight: 700, color: '#15803d', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }
          }, '$' + snap.balance.toFixed(2)),
          react.createElement('div', {
            key: 'bal-sub',
            style: { fontSize: '12px', color: '#15803d', marginTop: '6px', opacity: 0.85 }
          }, '累计充值: $' + snap.totalRecharged.toFixed(2) + ' · 近30天调用: ' + snap.totalRequests.toLocaleString() + ' 次 (实扣 $' + snap.totalActualCost.toFixed(4) + ')')
        ]),
        react.createElement('div', {
          key: 'grid',
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px',
            marginBottom: '16px'
          }
        }, [
          react.createElement('div', { key: 'c1', style: { background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' } }, [
            react.createElement('div', { key: 'k', style: { fontSize: '11px', color: '#64748b' } }, '今日余额消耗'),
            react.createElement('div', { key: 'v', style: { fontSize: '15px', fontWeight: 600, color: '#0f172a', marginTop: '4px', fontVariantNumeric: 'tabular-nums' } }, '$' + snap.todayCost.toFixed(4))
          ]),
          react.createElement('div', { key: 'c2', style: { background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' } }, [
            react.createElement('div', { key: 'k', style: { fontSize: '11px', color: '#64748b' } }, '今日消耗 Tokens'),
            react.createElement('div', { key: 'v', style: { fontSize: '15px', fontWeight: 600, color: '#0f172a', marginTop: '4px', fontVariantNumeric: 'tabular-nums' } }, snap.todayTokens.toLocaleString())
          ]),
          react.createElement('div', { key: 'c3', style: { background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' } }, [
            react.createElement('div', { key: 'k', style: { fontSize: '11px', color: '#64748b' } }, '名下可用密钥'),
            react.createElement('div', { key: 'v', style: { fontSize: '15px', fontWeight: 600, color: '#0f172a', marginTop: '4px', fontVariantNumeric: 'tabular-nums' } }, snap.keysCount + ' 个')
          ]),
          react.createElement('div', { key: 'c4', style: { background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' } }, [
            react.createElement('div', { key: 'k', style: { fontSize: '11px', color: '#64748b' } }, '今日调用次数'),
            react.createElement('div', { key: 'v', style: { fontSize: '15px', fontWeight: 600, color: '#0f172a', marginTop: '4px', fontVariantNumeric: 'tabular-nums' } }, snap.todayRequests + ' 次')
          ])
        ]),
        react.createElement('div', {
          key: 'token-box',
          style: { marginBottom: '12px' }
        }, [
          react.createElement('label', {
            key: 'lbl',
            style: { display: 'block', fontSize: '12px', fontWeight: 500, color: '#475569', marginBottom: '6px' }
          }, '手动添加其他账号 (粘贴 Auth Token / JWT):'),
          react.createElement('div', {
            key: 'inp-row',
            style: { display: 'flex', gap: '8px' }
          }, [
            react.createElement('input', {
              key: 'inp',
              type: 'password',
              value: tokenDraft,
              onChange: function(e) { setTokenDraft(e.target.value); },
              placeholder: '粘贴 sub.anzhiyu.com 的 localStorage.auth_token',
              style: {
                flex: 1,
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                outline: 'none'
              }
            }),
            react.createElement('button', {
              key: 'save-btn',
              onClick: handleAddManualToken,
              style: {
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '6px',
                border: 'none',
                background: '#059669',
                color: '#ffffff',
                cursor: 'pointer'
              }
            }, '添加账号')
          ])
        ]),
        statusMsg ? react.createElement('div', {
          key: 'status-msg',
          style: { fontSize: '12px', color: '#059669', marginBottom: '10px', fontWeight: 500 }
        }, statusMsg) : null
      ]);
    }

    function apply(ctx) {
      if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', mountDOMWidget);
        } else {
          mountDOMWidget();
        }
      }

      var slots = ctx.get ? ctx.get('slots') : ctx.slots;
      if (slots) {
        try {
          slots.inject('shell.overlay', function() {
            return slots.register({
              name: 'shell.overlay',
              id: 'yuyu-quota-overlay'
            }, function() {
              return react ? react.createElement(YuyuReactComponent) : null;
            });
          });

          slots.inject('settings.section', function() {
            return slots.register({
              name: 'settings.section',
              id: 'yuyu-quota-settings',
              order: 50,
              label: function() { return '鱼鱼API 资产'; }
            }, function() {
              return react ? react.createElement(YuyuSettingsSection) : null;
            });
          });

          slots.inject('plugins.bundle.config', function() {
            return slots.register({
              name: 'plugins.bundle.config',
              key: PLUGIN_ID
            }, function() {
              return react ? react.createElement(YuyuSettingsSection) : null;
            });
          });
        } catch(e) {}
      }
    }

    var mod = { exports: {} };
    mod.exports.apply = apply;
    mod.exports.inject = ['slots'];
    mod.exports.name = PLUGIN_ID;
    return mod.exports;
  }

  if (typeof window !== 'undefined' && window.__ModuleLoader__ && window.__ModuleLoader__.load) {
    window.__ModuleLoader__.load({
      id: PLUGIN_ID,
      factory: factory
    });
  }

  if (typeof window !== 'undefined') {
    try {
      var selfMod = factory(function(name) {
        if (name === 'react') return window.React;
        return {};
      });
      selfMod.apply({ get: function() { return null; } });
    } catch(e) {}
  }
})();
