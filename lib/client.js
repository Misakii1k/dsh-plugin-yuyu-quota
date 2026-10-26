// DeepSeek Harness Client Extension for 鱼鱼API
// 规范：Oil UI 0.25.0 + 纯原生矢量 SVG (零 Emoji) + 多账号秒切 + 本地 LevelDB 无感同步 (零 MCP 依赖)
(function() {
  var PLUGIN_ID = 'dsh-plugin-yuyu-quota';
  var STORAGE_KEY = 'dsh_yuyu_multi_store_v1';
  var BRIDGE_BASE = 'http://127.0.0.1:53788/yuyu-quota/api';

  var SVG_WALLET = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V7H4a2 2 0 0 1 0-4h16v4"/><path d="M2 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M17 12a2 2 0 0 0 0 4h4v-4Z"/></svg>';
  var SVG_FISH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6s-7.56-2.54-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .5 6.5-1.5 1.5-1.5 5-.5 6.5 2.85-.47 4.27-2.5 4.27-5.17v-2.66Z"/></svg>';
  var SVG_REFRESH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>';
  var SVG_SETTINGS = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
  var SVG_BROWSER = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M2 8h20"/><circle cx="6" cy="6" r=".5" fill="currentColor"/></svg>';
  var SVG_CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  var SVG_CLOSE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var SVG_BOOK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
  var SVG_BELL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>';
  var SVG_DOWNLOAD = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  var INTERVAL_MS_MAP = {
    '1s': 1000,
    '5s': 5000,
    '30s': 30000,
    '1m': 60000,
    '5m': 300000
  };
  var INTERVAL_LABEL_MAP = {
    '1s': '1秒 (实时)',
    '5s': '5秒',
    '30s': '30秒',
    '1m': '1分钟',
    '5m': '5分钟'
  };
  var currentInterval = '30s';
  try {
    var savedInterval = window.localStorage.getItem('dsh_yuyu_refresh_interval');
    if (savedInterval && INTERVAL_MS_MAP[savedInterval]) {
      currentInterval = savedInterval;
    }
  } catch(e) {}

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

  var initialAccounts = [];

  var tokenStore = {
    activeEmail: '',
    email: '',
    balance: 0.00,
    totalRecharged: 0.00,
    todayCost: 0.0000,
    todayRawCost: 0.0000,
    todayTokens: 0,
    keysCount: 0,
    todayRequests: 0,
    totalRequests: 0,
    totalActualCost: 0.0000,
    alertThreshold: 2.0,
    accounts: initialAccounts,
    lastSync: '未同步',
    /** 后端是否可达（成功从服务端拿到数据） */
    online: false,
    /** 最近一轮的 Token / 额度汇报 */
    lastTurn: null,
    /** 后端汇报的单调序号，用于判断“又完成了一轮” */
    lastTurnSeq: 0,
    /** 用户偏好（通知 / 汇报 / 更新） */
    preferences: null,
    /** 最近一次更新检查结果 */
    updateInfo: null,
    /** 插件版本号 */
    version: '',
    /** 本次数据实际获取时刻（ms）—— 只有真实成功刷新才更新 */
    fetchedAt: 0,
    /** 服务端余额字段的更新时间 */
    serverUpdatedAt: '',
    /** 连续失败次数 */
    failCount: 0
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
    if (typeof snap.fetchedAt === 'number') tokenStore.fetchedAt = snap.fetchedAt;
    else if (typeof snap.timestamp === 'number') tokenStore.fetchedAt = snap.timestamp;
    if (snap.serverUpdatedAt) tokenStore.serverUpdatedAt = snap.serverUpdatedAt;
  }

  function formatSyncTime() {
    if (!tokenStore.fetchedAt) return '尚未获取';
    try {
      return new Date(tokenStore.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return new Date(tokenStore.fetchedAt).toLocaleTimeString();
    }
  }

  function applyBackendPayload(body) {
    if (!body) return false;
    if (Array.isArray(body.accounts) && body.accounts.length > 0) {
      tokenStore.accounts = body.accounts;
    }
    if (body.activeEmail) {
      tokenStore.activeEmail = body.activeEmail;
    }
    if (body.refreshInterval && INTERVAL_MS_MAP[body.refreshInterval]) {
      currentInterval = body.refreshInterval;
    }
    if (body.preferences && typeof body.preferences === 'object') {
      tokenStore.preferences = body.preferences;
      // 由已挂载的浮窗负责刷新控件外观（未挂载时是空实现）
      if (typeof window.__yuyuApplyPreferences === 'function') {
        try { window.__yuyuApplyPreferences(body.preferences); } catch (e) {}
      }
    }
    if (body.lastTurn !== undefined) {
      tokenStore.lastTurn = body.lastTurn;
      if (typeof body.lastTurnSeq === 'number') tokenStore.lastTurnSeq = body.lastTurnSeq;
      if (typeof window.__yuyuRenderTurnReport === 'function') {
        try { window.__yuyuRenderTurnReport(body.lastTurn); } catch (e) {}
      }
    }
    if (body.update && typeof body.update === 'object') {
      tokenStore.updateInfo = body.update;
    }
    if (body.version) {
      tokenStore.version = body.version;
    }
    if (body.snapshot && body.snapshot.success) {
      applySnapshotFields(body.snapshot);
      tokenStore.online = true;
      tokenStore.failCount = 0;
      // 只有真实拿到服务端数据才推进“已同步”时间
      tokenStore.lastSync = formatSyncTime();
    } else {
      var found = tokenStore.accounts.find(function(a) { return a.email === tokenStore.activeEmail; }) || tokenStore.accounts[0];
      if (found) {
        tokenStore.email = found.email;
        tokenStore.balance = Number(found.balance || 0);
        if (found.snapshot) applySnapshotFields(found.snapshot);
      }
      // 降级：保留上一次真实同步时间，不伪造“已同步”
      tokenStore.online = false;
    }
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
        tokenStore.online = false;
        tokenStore.failCount = (tokenStore.failCount || 0) + 1;
        // 不推进 lastSync：显示的是最后一次真实成功的时间
        updateUI();
        notifyListeners();
        if (callback) callback(tokenStore, new Error('backend unreachable'), null);
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
      chip.className = 'yuyu-avatar-chip' + (isActive ? ' active' : '');
      chip.title = acc.email + ' ($' + Number(acc.balance || 0).toFixed(2) + ')';
      chip.style.cssText = [
        'display:flex;align-items:center;gap:5px;padding:3px 8px 3px 4px;border-radius:20px;cursor:pointer;font-size:11px;user-select:none;',
        'transition:transform 0.12s ease, background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;',
        isActive
          ? 'background:#eff6ff;border:1px solid #93c5fd;color:#1d4ed8;box-shadow:0 0 0 2px rgba(37,99,235,0.14);animation:yuyuGlow 2.5s infinite ease-in-out;'
          : 'background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;'
      ].join('');

      var initial = (acc.email || '').replace(/@.*/, '').slice(0, 2).toUpperCase() || 'ID';
      var circle = document.createElement('span');
      circle.style.cssText = 'width:17px;height:17px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;transition:background 0.2s ease;' +
        (isActive ? 'background:#2563eb;color:#ffffff;' : 'background:#94a3b8;color:#ffffff;');
      circle.textContent = initial;

      var balSpan = document.createElement('span');
      balSpan.style.cssText = 'font-variant-numeric:tabular-nums;font-weight:600;';
      var balNum = typeof acc.balance === 'number' ? acc.balance : (acc.snapshot ? acc.snapshot.balance : 0);
      balSpan.textContent = '$' + Number(balNum || 0).toFixed(2);

      chip.appendChild(circle);
      chip.appendChild(balSpan);

      chip.addEventListener('mouseenter', function() {
        if (!acc.email || acc.email === tokenStore.activeEmail) return;
        chip.style.transform = 'translateY(-1px)';
        chip.style.background = '#e8ebf0';
      });
      chip.addEventListener('mouseleave', function() {
        if (!acc.email || acc.email === tokenStore.activeEmail) return;
        chip.style.transform = 'none';
        chip.style.background = '#f1f5f9';
      });
      chip.addEventListener('mousedown', function() {
        chip.style.transform = 'scale(0.93)';
      });
      chip.addEventListener('mouseup', function() {
        chip.style.transform = 'none';
      });

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
    tip.textContent = text;
    tip.style.color = isError ? '#b91c1c' : '#059669';
    tip.style.background = isError ? '#fef2f2' : '#f0fdf4';
    tip.classList.add('show');
    if (window.__yuyuTipTimer) clearTimeout(window.__yuyuTipTimer);
    window.__yuyuTipTimer = setTimeout(function() {
      tip.classList.remove('show');
    }, 2800);
  }

  function formatTokens(num) {
    var n = Number(num) || 0;
    if (n < 1000) return String(n);
    if (n < 1000000) {
      var k = n / 1000;
      return (k >= 100 ? k.toFixed(0) : k.toFixed(1)).replace(/\.0$/, '') + 'K';
    }
    var m = n / 1000000;
    return (m >= 100 ? m.toFixed(1) : m.toFixed(2)).replace(/\.00$/, '').replace(/(\.[1-9])0$/, '$1') + 'M';
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
    if (cardBal) {
      cardBal.classList.remove('is-animating');
      void cardBal.offsetWidth; // 触发 reflow 重置动画
      cardBal.textContent = tokenStore.balance.toFixed(2);
      cardBal.classList.add('is-animating');
    }
    if (cardRecharge) cardRecharge.textContent = '累计充值 $' + tokenStore.totalRecharged.toFixed(2);
    if (cardCost) cardCost.textContent = '$' + tokenStore.todayCost.toFixed(4);
    if (cardTokens) {
      cardTokens.textContent = formatTokens(tokenStore.todayTokens);
      cardTokens.title = tokenStore.todayTokens.toLocaleString() + ' Tokens';
    }
    if (cardKeys) cardKeys.textContent = tokenStore.keysCount + ' 个';
    if (syncTime) syncTime.textContent = '已同步 ' + tokenStore.lastSync;

    // 连接状态徽标：离线时不得伪装成“本地直连”绿色
    var connDot = document.getElementById('yuyu-conn-dot');
    var connLabel = document.getElementById('yuyu-conn-label');
    var connWrap = document.getElementById('yuyu-conn-wrap');
    if (connLabel) connLabel.textContent = tokenStore.online ? '本地直连' : '离线 · 数据显示 ' + formatSyncTime();
    if (connDot) {
      connDot.style.background = tokenStore.online ? '#10b981' : '#f59e0b';
      connDot.style.boxShadow = tokenStore.online
        ? '0 0 0 2px rgba(16,185,129,0.2)'
        : '0 0 0 2px rgba(245,158,11,0.2)';
    }
    if (connWrap) connWrap.style.color = tokenStore.online ? '#10b981' : '#b45309';

    renderAccountSwitcherDOM();
  }

  // ===================== 浮窗拖动与贴边吸附 =====================
  // 设计要点：
  // 1. 用 Pointer Events + setPointerCapture，鼠标/触控/手写笔同一套逻辑；
  // 2. 位移阈值 4px、时长阈值 250ms 以内视为“点击”，否则是拖拽 —— 避免拖完手一松就误展开卡片；
  // 3. 拖拽期间用 left/top 直接定位（不用 transform），保证跟手无延迟；
  // 4. 松手后距边缘 24px 内吸附，否则保持自由位置；
  // 5. 位置写入 localStorage，窗口尺寸变化时按比例钳制回可视区。
  var POS_STORAGE_KEY = 'dsh_yuyu_pill_pos_v1';
  var SNAP_DISTANCE = 24;
  var DRAG_THRESHOLD = 4;
  var CLICK_TIME_LIMIT = 250;

  function readStoredPosition() {
    try {
      var raw = window.localStorage.getItem(POS_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
      return {
        x: parsed.x,
        y: parsed.y,
        edge: parsed.edge === 'left' || parsed.edge === 'right' ? parsed.edge : 'free'
      };
    } catch (e) {
      return null;
    }
  }

  function writeStoredPosition(pos) {
    try {
      window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(pos));
    } catch (e) {}
  }

  /** 把坐标钳制在视口内（留 8px 余量，避免贴死边角点不到）。 */
  function clampToViewport(x, y, width, height) {
    var maxX = Math.max(0, window.innerWidth - width - 8);
    var maxY = Math.max(0, window.innerHeight - height - 8);
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY)
    };
  }

  /** 计算吸附后的落点：横向贴左右边，纵向贴上下边（两者独立判定）。 */
  function snapToEdges(x, y, width, height) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var result = { x: x, y: y, edge: 'free' };

    if (x <= SNAP_DISTANCE) {
      result.x = 8;
      result.edge = 'left';
    } else if (x + width >= vw - SNAP_DISTANCE) {
      result.x = vw - width - 8;
      result.edge = 'right';
    }

    if (y <= SNAP_DISTANCE) {
      result.y = 8;
    } else if (y + height >= vh - SNAP_DISTANCE) {
      result.y = vh - height - 8;
    }

    return result;
  }

  /**
   * 给浮窗容器装上拖动能力。
   * @returns {{ applyPosition: Function, getEdge: Function, isDragging: Function }}
   */
  function installDraggable(container, handle, options) {
    var opts = options || {};
    var onEdgeChange = opts.onEdgeChange || function() {};
    var onDragStateChange = opts.onDragStateChange || function() {};
    var state = { x: 0, y: 0, edge: 'free' };
    var drag = null;
    var suppressClick = false;

    function sizeOf() {
      var rect = container.getBoundingClientRect();
      return {
        width: rect.width || container.offsetWidth || 200,
        height: rect.height || container.offsetHeight || 40
      };
    }

    /** 把容器切换成“绝对定位 + left/top”模式，并写入坐标。 */
    function applyPosition(pos, animate) {
      var size = sizeOf();
      var clamped = clampToViewport(pos.x, pos.y, size.width, size.height);
      state.x = clamped.x;
      state.y = clamped.y;
      state.edge = pos.edge || 'free';

      container.style.left = clamped.x + 'px';
      container.style.top = clamped.y + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';

      if (animate) {
        container.style.transition = 'left 0.26s cubic-bezier(0.16, 1, 0.3, 1), top 0.26s cubic-bezier(0.16, 1, 0.3, 1)';
        setTimeout(function() {
          container.style.transition = '';
        }, 280);
      }

      onEdgeChange(state.edge);
      return state;
    }

    /** 从右下角默认位置初始化：没有历史记录时贴右下。 */
    function initFromDefault() {
      var size = sizeOf();
      var x = window.innerWidth - size.width - 28;
      var y = window.innerHeight - size.height - 20;
      return applyPosition({ x: x, y: y, edge: 'right' }, false);
    }

    function restore() {
      var stored = readStoredPosition();
      if (stored) {
        // 视口可能变小了：按当前尺寸重新钳制，但不改变用户选的边缘归属
        return applyPosition(stored, false);
      }
      return initFromDefault();
    }

    handle.addEventListener('pointerdown', function(event) {
      // 只响应主键；右键/中键留给浏览器菜单
      if (event.button !== undefined && event.button !== 0) return;
      var rect = container.getBoundingClientRect();
      drag = {
        startX: event.clientX,
        startY: event.clientY,
        originX: rect.left,
        originY: rect.top,
        startedAt: Date.now(),
        moved: false,
        pointerId: event.pointerId
      };
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (e) {}
    });

    handle.addEventListener('pointermove', function(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      var dx = event.clientX - drag.startX;
      var dy = event.clientY - drag.startY;

      if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
        return;
      }

      if (!drag.moved) {
        drag.moved = true;
        container.style.transition = 'none';
        onDragStateChange(true);
      }

      event.preventDefault();
      applyPosition({ x: drag.originX + dx, y: drag.originY + dy, edge: 'free' }, false);
    });

    function finishDrag(event) {
      if (!drag || (event && drag.pointerId !== event.pointerId)) return;
      var wasDrag = drag.moved;
      var elapsed = Date.now() - drag.startedAt;
      var pointerId = drag.pointerId;
      drag = null;

      try {
        handle.releasePointerCapture(pointerId);
      } catch (e) {}

      if (!wasDrag) return;

      onDragStateChange(false);
      // 松手吸附
      var snapped = snapToEdges(state.x, state.y, sizeOf().width, sizeOf().height);
      applyPosition(snapped, true);
      writeStoredPosition({ x: state.x, y: state.y, edge: state.edge });

      // 拖拽结束后短暂屏蔽 click，避免“拖完顺带展开卡片”
      if (elapsed < CLICK_TIME_LIMIT || wasDrag) {
        suppressClick = true;
        setTimeout(function() {
          suppressClick = false;
        }, 120);
      }
    }

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);

    // 点击拦截：拖拽刚结束时吞掉这次 click
    handle.addEventListener('click', function(event) {
      if (suppressClick) {
        event.stopPropagation();
        event.preventDefault();
      }
    }, true);

    // 窗口尺寸变化：重新钳制，避免浮窗跑到屏幕外
    var resizeTimer = null;
    window.addEventListener('resize', function() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        if (!container.isConnected) return;
        applyPosition({ x: state.x, y: state.y, edge: state.edge }, false);
        writeStoredPosition({ x: state.x, y: state.y, edge: state.edge });
      }, 120);
    });

    return {
      restore: restore,
      applyPosition: applyPosition,
      getEdge: function() { return state.edge; },
      getPosition: function() { return { x: state.x, y: state.y, edge: state.edge }; },
      isDragging: function() { return Boolean(drag && drag.moved); }
    };
  }

  // DOM 悬浮胶囊注入
  function mountDOMWidget() {
    var existing = document.getElementById('yuyu-quota-floating-container');
    if (existing) {
      existing.remove();
    }

    var container = document.createElement('div');
    container.id = 'yuyu-quota-floating-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:28px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;font-size:12px;user-select:none;pointer-events:auto;touch-action:none;';

    var html = [
      '<style>',
      '  @keyframes yuyuNumPop {',
      '    0% { transform: translateY(4px) scale(0.97); opacity: 0.6; }',
      '    60% { transform: translateY(-1px) scale(1.01); opacity: 1; }',
      '    100% { transform: translateY(0) scale(1); opacity: 1; }',
      '  }',
      '  @keyframes yuyuGlow {',
      '    0%, 100% { box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12); }',
      '    50% { box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.22); }',
      '  }',
      '  #yuyu-pill-btn {',
      '    display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 9999px;',
      '    background: #ffffff; color: #1e293b; border: 1px solid #e2e8f0; box-shadow: 0 4px 14px rgba(0,0,0,0.06);',
      '    cursor: pointer; transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.16s cubic-bezier(0.16, 1, 0.3, 1);',
      '  }',
      '  #yuyu-pill-btn:hover {',
      '    transform: translateY(-2px); box-shadow: 0 8px 20px -2px rgba(15, 23, 42, 0.12);',
      '  }',
      '  #yuyu-pill-btn:active {',
      '    transform: scale(0.95); transition: transform 0.08s ease;',
      '  }',
      '  #yuyu-card-popup {',
      '    position: absolute; bottom: 46px; width: 336px;',
      // 贴左边时弹窗向右展开（left:0），贴右边/自由时向左展开（right:0）
      '    left: var(--yuyu-card-left, auto);',
      '    right: var(--yuyu-card-right, 0);',
      '    background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);',
      '    border: 1px solid rgba(226, 232, 240, 0.92); border-radius: 18px;',
      '    box-shadow: 0 16px 36px -4px rgba(15, 23, 42, 0.12), 0 4px 14px rgba(15, 23, 42, 0.04);',
      '    padding: 16px 18px; color: #0f172a; box-sizing: border-box;',
      '    transform-origin: var(--yuyu-origin-x, right) bottom;',
      '    opacity: 0; transform: scale(0.95) translateY(12px); pointer-events: none; visibility: hidden;',
      '    transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.22s;',
      '  }',
      // 贴边后若弹窗会超出视口，用这个类把弹窗拉回可视区
      '  #yuyu-card-popup.clamp-to-edge { max-height: calc(100vh - 110px); overflow-y: auto; }',
      '  #yuyu-card-popup.is-open {',
      '    opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; visibility: visible;',
      '  }',
      '  #yuyu-card-bal.is-animating {',
      '    animation: yuyuNumPop 0.32s cubic-bezier(0.16, 1, 0.3, 1);',
      '  }',
      '  #yuyu-card-sync:hover {',
      '    border-color: #2563eb; color: #1d4ed8; background: #f8fafc; transform: translateY(-1px);',
      '    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.08);',
      '  }',
      '  #yuyu-card-sync:active {',
      '    transform: scale(0.97);',
      '  }',
      '  #yuyu-card-refresh:hover {',
      '    color: #0f172a; background: #f1f5f9; transform: scale(1.06);',
      '  }',
      '  #yuyu-card-refresh:active {',
      '    transform: scale(0.92);',
      '  }',
      '  .yuyu-drawer-content {',
      '    display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;',
      '    overflow: hidden; max-height: 80px; opacity: 1; padding-top: 8px; margin-top: 8px;',
      '    border-top: 1px dashed #e2e8f0;',
      '    transition: max-height 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease, margin 0.22s ease, padding 0.22s ease;',
      '  }',
      '  .yuyu-drawer-content.collapsed {',
      '    max-height: 0; opacity: 0; padding-top: 0; margin-top: 0; border-top-color: transparent; pointer-events: none;',
      '  }',
      '  .yuyu-drawer-arrow {',
      '    display: inline-flex; color: #64748b; transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);',
      '  }',
      '  .yuyu-drawer-arrow.collapsed {',
      '    transform: rotate(-90deg);',
      '  }',
      '  .yuyu-sync-tip {',
      '    font-size: 10.5px; text-align: center; padding: 4px 6px; border-radius: 5px;',
      '    background: #f0fdf4; color: #059669; max-height: 0; opacity: 0; overflow: hidden;',
      '    transform: translateY(4px); transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);',
      '  }',
      '  .yuyu-sync-tip.show {',
      '    max-height: 36px; opacity: 1; transform: translateY(0); margin-top: 6px;',
      '  }',
      '</style>',
      '<div id="yuyu-pill-btn" style="position:relative;">',
      '  <span style="display:inline-flex;color:#475569;">' + SVG_WALLET + '</span>',
      '  <span style="font-weight:600;font-size:11px;color:#475569;letter-spacing:0.2px;">鱼鱼</span>',
      '  <span id="yuyu-pill-val" style="color:#059669;font-weight:700;font-variant-numeric:tabular-nums;font-size:12.5px;">$' + tokenStore.balance.toFixed(2) + '</span>',
      '</div>',
      '<div id="yuyu-card-popup">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
      '    <div style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#0f172a;">',
      '      <div style="width:24px;height:24px;border-radius:6px;background:#eff6ff;border:1px solid #dbeafe;display:flex;align-items:center;justify-content:center;color:#2563eb;transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1);">' + SVG_FISH + '</div>',
      '      <span>鱼鱼 API</span>',
      '    </div>',
      '    <div style="display:flex;align-items:center;gap:4px;">',
      '      <div id="yuyu-avatars-row" style="display:flex;gap:4px;"></div>',
      '      <button id="yuyu-card-refresh" style="background:#f8fafc;border:1px solid #e2e8f0;cursor:pointer;padding:4px;color:#64748b;display:inline-flex;border-radius:5px;transition:all 0.16s ease;" title="刷新数据">' + SVG_REFRESH + '</button>',
      '      <button id="yuyu-card-settings-btn" style="background:#f8fafc;border:1px solid #e2e8f0;cursor:pointer;padding:4px;color:#64748b;display:inline-flex;border-radius:5px;transition:all 0.16s ease;" title="刷新频率设置">' + SVG_SETTINGS + '</button>',
      '    </div>',
      '  </div>',
      '  <div id="yuyu-settings-panel" style="max-height:0;opacity:0;overflow:hidden;transition:max-height 0.24s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease, margin 0.2s ease;margin-bottom:0;">',
      '    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-bottom:8px;">',
      '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:10.5px;color:#475569;font-weight:600;">',
      '        <span>刷新频率</span>',
      '        <span id="yuyu-interval-hint" style="font-weight:500;color:#2563eb;font-variant-numeric:tabular-nums;">当前: ' + (INTERVAL_LABEL_MAP[currentInterval] || currentInterval) + '</span>',
      '      </div>',
      '      <div id="yuyu-interval-tabs" style="display:flex;gap:3px;background:#e2e8f0;padding:2px;border-radius:6px;">',
      '        <button type="button" class="yuyu-interval-tab" data-val="1s">1秒</button>',
      '        <button type="button" class="yuyu-interval-tab" data-val="5s">5秒</button>',
      '        <button type="button" class="yuyu-interval-tab" data-val="30s">30秒</button>',
      '        <button type="button" class="yuyu-interval-tab" data-val="1m">1分</button>',
      '        <button type="button" class="yuyu-interval-tab" data-val="5m">5分</button>',
      '      </div>',
      '      <div style="margin-top:8px;padding-top:7px;border-top:1px dashed #e2e8f0;display:flex;justify-content:space-between;align-items:center;">',
      '        <span style="font-size:10.5px;color:#64748b;">新手上手与特性指引</span>',
      '        <button id="yuyu-open-tutorial-btn" type="button" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:3px 8px;font-size:10.5px;font-weight:500;color:#2563eb;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:all 0.15s ease;" title="查看动效新手使用教程">' + SVG_BOOK + '<span>使用教程</span></button>',
      '      </div>',
      '    </div>',
      // —— 完成通知 ——
      '    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-bottom:8px;">',
      '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:10.5px;color:#475569;font-weight:600;">',
      '        <span style="display:inline-flex;align-items:center;gap:4px;">' + SVG_BELL + '<span>任务完成通知</span></span>',
      '        <button id="yuyu-notify-toggle" type="button" data-on="1" style="background:#2563eb;border:1px solid #2563eb;border-radius:20px;padding:2px 10px;font-size:10px;font-weight:600;color:#ffffff;cursor:pointer;transition:all 0.16s ease;">已开启</button>',
      '      </div>',
      '      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">',
      '        <select id="yuyu-notify-sound" style="flex:1;padding:3px 6px;font-size:10.5px;border-radius:5px;border:1px solid #cbd5e1;background:#ffffff;color:#334155;outline:none;">',
      '          <option value="Notification.Reminder">Windows 提醒（推荐）</option>',
      '          <option value="Notification.Default">Windows 默认</option>',
      '          <option value="Notification.IM">即时消息</option>',
      '          <option value="Notification.Mail">邮件</option>',
      '          <option value="Notification.SMS">短信</option>',
      '          <option value="none">静音</option>',
      '        </select>',
      '        <button id="yuyu-notify-test" type="button" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:3px 8px;font-size:10.5px;font-weight:500;color:#2563eb;cursor:pointer;white-space:nowrap;">测试通知</button>',
      '      </div>',
      '    </div>',
      // —— 更新 ——
      '    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-bottom:8px;">',
      '      <div style="display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:#475569;font-weight:600;">',
      '        <span style="display:inline-flex;align-items:center;gap:4px;">' + SVG_DOWNLOAD + '<span>插件版本</span></span>',
      '        <span id="yuyu-version-label" style="font-weight:500;color:#2563eb;font-variant-numeric:tabular-nums;">v' + (tokenStore.version || '—') + '</span>',
      '      </div>',
      '      <div id="yuyu-update-row" style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;gap:6px;">',
      '        <span id="yuyu-update-hint" style="font-size:10px;color:#94a3b8;">尚未检查</span>',
      '        <button id="yuyu-update-check" type="button" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:3px 8px;font-size:10.5px;font-weight:500;color:#2563eb;cursor:pointer;white-space:nowrap;">检查更新</button>',
      '      </div>',
      '      <div style="margin-top:6px;display:flex;gap:4px;">',
      '        <input id="yuyu-feed-input" type="url" placeholder="更新源地址（如 https://xxx.pages.dev，可留空）" style="flex:1;min-width:0;padding:3px 6px;font-size:10px;border-radius:5px;border:1px solid #cbd5e1;background:#ffffff;color:#334155;outline:none;" />',
      '        <button id="yuyu-feed-save" type="button" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:3px 8px;font-size:10.5px;font-weight:500;color:#2563eb;cursor:pointer;white-space:nowrap;">保存</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div style="text-align:center;padding:4px 0 6px 0;">',
      '    <div style="font-size:11px;color:#64748b;margin-bottom:2px;">可用余额</div>',
      '    <div style="font-size:34px;font-weight:800;color:#0f172a;letter-spacing:-1px;line-height:1.1;font-variant-numeric:tabular-nums;display:inline-block;">$<span id="yuyu-card-bal">' + tokenStore.balance.toFixed(2) + '</span></div>',
      '    <div style="margin-top:5px;"><span id="yuyu-card-recharge" style="display:inline-flex;align-items:center;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;font-size:10.5px;padding:2px 8px;border-radius:12px;font-weight:500;font-variant-numeric:tabular-nums;transition:transform 0.15s ease;">累计充值 $' + tokenStore.totalRecharged.toFixed(2) + '</span></div>',
      '  </div>',
      '  <div id="yuyu-turn-panel" style="display:none;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;margin:10px 0 0;flex-direction:column;gap:6px;">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600;color:#334155;">',
      '      <span>本轮用量</span>',
      '      <span id="yuyu-turn-meta" style="font-size:10px;font-weight:500;color:#64748b;font-variant-numeric:tabular-nums;"></span>',
      '    </div>',
      '    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">',
      '      <div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:10px;color:#64748b;">Tokens</span><span id="yuyu-turn-tokens" class="yuyu-turn-num" style="font-size:13px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums;">—</span></div>',
      '      <div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:10px;color:#64748b;">实扣额度</span><span id="yuyu-turn-quota" class="yuyu-turn-num" style="font-size:13px;font-weight:700;color:#059669;font-variant-numeric:tabular-nums;">—</span></div>',
      '    </div>',
      '    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px dashed #e2e8f0;font-size:10px;color:#64748b;">',
      '      <span>会话累计</span>',
      '      <span id="yuyu-session-total" style="font-weight:600;color:#334155;font-variant-numeric:tabular-nums;">—</span>',
      '    </div>',
      '  </div>',
      '  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;margin:10px 0;display:flex;flex-direction:column;transition:border-color 0.18s;">',
      '    <div id="yuyu-drawer-toggle" style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600;color:#334155;cursor:pointer;user-select:none;">',
      '      <span>今日用量</span>',
      '      <span id="yuyu-drawer-arrow" class="yuyu-drawer-arrow">' + SVG_CHEVRON + '</span>',
      '    </div>',
      '    <div id="yuyu-drawer-content" class="yuyu-drawer-content">',
      '      <div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:10px;color:#64748b;">实扣</span><span id="yuyu-card-cost" style="font-size:11.5px;font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums;">$' + tokenStore.todayCost.toFixed(4) + '</span></div>',
      '      <div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:10px;color:#64748b;">Tokens</span><span id="yuyu-card-tokens" style="font-size:11.5px;font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums;">' + tokenStore.todayTokens.toLocaleString() + '</span></div>',
      '      <div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:10px;color:#64748b;">密钥</span><span id="yuyu-card-keys" style="font-size:11.5px;font-weight:600;color:#0f172a;font-variant-numeric:tabular-nums;">' + tokenStore.keysCount + ' 个</span></div>',
      '    </div>',
      '  </div>',
      '  <button id="yuyu-card-sync" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 0;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:11.5px;font-weight:500;color:#334155;transition:all 0.16s cubic-bezier(0.16,1,0.3,1);user-select:none;">',
      '    <span style="display:inline-flex;">' + SVG_BROWSER + '</span>',
      '    <span id="yuyu-sync-label">从浏览器同步账号</span>',
      '  </button>',
      '  <div id="yuyu-sync-tip" class="yuyu-sync-tip"></div>',
      '  <div style="margin-top:10px;padding-top:6px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#94a3b8;">',
      '    <span id="yuyu-sync-time">已同步 ' + tokenStore.lastSync + '</span>',
      '    <span id="yuyu-conn-wrap" style="display:inline-flex;align-items:center;gap:4px;color:' + (tokenStore.online ? '#10b981' : '#b45309') + ';font-weight:500;"><span id="yuyu-conn-dot" style="width:5px;height:5px;border-radius:50%;background:' + (tokenStore.online ? '#10b981' : '#f59e0b') + ';box-shadow:0 0 0 2px ' + (tokenStore.online ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)') + ';"></span><span id="yuyu-conn-label">' + (tokenStore.online ? '本地直连' : '离线 · 数据显示 ' + tokenStore.lastSync) + '</span></span>',
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
    var settingsBtn = container.querySelector('#yuyu-card-settings-btn');
    var settingsPanel = container.querySelector('#yuyu-settings-panel');
    var intervalHint = container.querySelector('#yuyu-interval-hint');
    var syncLabel = container.querySelector('#yuyu-sync-label');
    var drawerToggle = container.querySelector('#yuyu-drawer-toggle');
    var drawerContent = container.querySelector('#yuyu-drawer-content');
    var drawerArrow = container.querySelector('#yuyu-drawer-arrow');

    // 拖动 + 贴边吸附：胶囊就是把手
    // 注意 isOpen 必须在使用前声明（installDraggable 的回调会读它）
    var isOpen = false;
    var draggable = installDraggable(container, pill, {
      onEdgeChange: function(edge) {
        // 贴左边 → 弹窗向右展开，避免跑出屏幕
        container.style.setProperty('--yuyu-card-left', edge === 'left' ? '0' : 'auto');
        container.style.setProperty('--yuyu-card-right', edge === 'left' ? 'auto' : '0');
        container.style.setProperty('--yuyu-origin-x', edge === 'left' ? 'left' : 'right');
      },
      onDragStateChange: function(dragging) {
        pill.style.cursor = dragging ? 'grabbing' : 'grab';
        // 拖拽时收起卡片，避免遮住落点
        if (dragging && isOpen) {
          isOpen = false;
          card.classList.remove('is-open');
        }
      }
    });
    pill.style.cursor = 'grab';
    pill.setAttribute('title', '按住可拖动，松手自动贴边');
    draggable.restore();

    // ===================== 本轮用量汇报 =====================
    var turnPanel = container.querySelector('#yuyu-turn-panel');
    var turnMeta = container.querySelector('#yuyu-turn-meta');
    var turnTokens = container.querySelector('#yuyu-turn-tokens');
    var turnQuota = container.querySelector('#yuyu-turn-quota');
    var sessionTotal = container.querySelector('#yuyu-session-total');
    var lastSeenTurnSeq = 0;
    var hasTurnBadge = false;

    function formatQuotaText(report) {
      if (!report) return '—';
      if (report.quotaSource === 'unavailable') return '待同步';
      var prefix = report.quotaSource === 'estimated' ? '约 ' : '';
      var value = Number(report.quota) || 0;
      // 额度通常很小，保留 4 位小数；大于 1 美元时只留 2 位
      return prefix + '$' + (value >= 1 ? value.toFixed(2) : value.toFixed(4));
    }

    function renderTurnReport(report) {
      if (!turnPanel) return;
      if (report && tokenStore.preferences && tokenStore.preferences.reportOnComplete === false) {
        turnPanel.style.display = 'none';
        return;
      }
      if (!report) {
        turnPanel.style.display = 'none';
        return;
      }
      turnPanel.style.display = 'flex';
      if (turnTokens) turnTokens.textContent = formatTokens(report.tokens ? report.tokens.totalTokens : 0);
      if (turnQuota) turnQuota.textContent = formatQuotaText(report);
      if (sessionTotal) {
        sessionTotal.textContent = formatTokens(report.sessionTokens || 0) + ' Tokens · $' + Number(report.sessionQuota || 0).toFixed(4);
      }
      if (turnMeta) {
        var bits = [];
        if (report.reason && report.reason !== 'completed') bits.push(report.reason === 'error' ? '失败' : '中断');
        if (report.model) bits.push(report.model);
        turnMeta.textContent = bits.join(' · ');
      }

      // 数字跳动提示
      [turnTokens, turnQuota].forEach(function(el) {
        if (!el) return;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'yuyuNumPop 0.32s cubic-bezier(0.16, 1, 0.3, 1)';
      });
    }

    /** 轮询后端最近一轮汇报；seq 变化时刷新并亮起角标 */
    function pollTurnReport() {
      requestBackend('/last-turn', { method: 'GET' })
        .then(function(body) {
          if (!body || !body.ok) return;
          var seq = Number(body.lastTurnSeq) || 0;
          if (seq === lastSeenTurnSeq) return;
          var isFirstSync = lastSeenTurnSeq === 0;
          lastSeenTurnSeq = seq;
          renderTurnReport(body.lastTurn);
          if (!isFirstSync && body.lastTurn) {
            markTurnBadge();
          }
        })
        .catch(function() {});
    }

    function markTurnBadge() {
      if (isOpen || hasTurnBadge) return;
      hasTurnBadge = true;
      var badge = document.createElement('span');
      badge.id = 'yuyu-turn-badge';
      badge.style.cssText = 'position:absolute;top:-2px;right:-2px;width:7px;height:7px;border-radius:50%;background:#2563eb;box-shadow:0 0 0 2px #ffffff;pointer-events:none;';
      pill.appendChild(badge);
    }

    function clearTurnBadge() {
      hasTurnBadge = false;
      var badge = document.getElementById('yuyu-turn-badge');
      if (badge) badge.remove();
    }

    // ===================== 设置：通知 / 更新 =====================
    var notifyToggle = container.querySelector('#yuyu-notify-toggle');
    var notifySound = container.querySelector('#yuyu-notify-sound');
    var notifyTest = container.querySelector('#yuyu-notify-test');
    var versionLabel = container.querySelector('#yuyu-version-label');
    var updateHint = container.querySelector('#yuyu-update-hint');
    var updateCheckBtn = container.querySelector('#yuyu-update-check');
    var feedInput = container.querySelector('#yuyu-feed-input');
    var feedSaveBtn = container.querySelector('#yuyu-feed-save');

    // 更新源地址：保存后立刻复查一次，省得用户再点「检查更新」
    if (feedSaveBtn && feedInput) {
      feedSaveBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var value = String(feedInput.value || '').trim();
        if (value && !/^https?:\/\//i.test(value)) {
          showTip('更新源地址必须以 http:// 或 https:// 开头', true);
          return;
        }
        savePreferences({ updateFeedUrl: value });
        showTip(value ? '更新源已保存，正在检查…' : '已清空更新源');
        if (value && updateCheckBtn) {
          setTimeout(function() { updateCheckBtn.click(); }, 300);
        }
      });
    }

    function paintNotifyToggle(enabled) {
      if (!notifyToggle) return;
      notifyToggle.setAttribute('data-on', enabled ? '1' : '0');
      notifyToggle.textContent = enabled ? '已开启' : '已关闭';
      notifyToggle.style.background = enabled ? '#2563eb' : '#e2e8f0';
      notifyToggle.style.borderColor = enabled ? '#2563eb' : '#cbd5e1';
      notifyToggle.style.color = enabled ? '#ffffff' : '#64748b';
    }

    function applyPreferences(prefs) {
      if (!prefs) return;
      tokenStore.preferences = prefs;
      paintNotifyToggle(prefs.notifyOnComplete !== false);
      if (notifySound) {
        notifySound.value = prefs.notifySound || 'Notification.Reminder';
      }
      // 不要把用户正在编辑的地址覆盖掉
      if (feedInput && document.activeElement !== feedInput) {
        feedInput.value = prefs.updateFeedUrl || '';
      }
      renderTurnReport(tokenStore.lastTurn);
    }

    // 暴露给 applyBackendPayload（它在 mountDOMWidget 作用域之外）
    window.__yuyuApplyPreferences = applyPreferences;
    window.__yuyuRenderTurnReport = renderTurnReport;

    function savePreferences(patch) {
      var merged = Object.assign({}, tokenStore.preferences || {}, patch);
      tokenStore.preferences = merged;
      requestBackend('/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferences: merged })
      })
        .then(function(body) {
          if (body && body.ok) applyPreferences(body.preferences);
        })
        .catch(function() {
          showTip('设置保存失败，请检查后端连接', true);
        });
    }

    if (notifyToggle) {
      notifyToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        var next = !(tokenStore.preferences && tokenStore.preferences.notifyOnComplete !== false);
        paintNotifyToggle(next);
        savePreferences({ notifyOnComplete: next });
        showTip(next ? '任务完成通知已开启' : '任务完成通知已关闭');
      });
    }

    if (notifySound) {
      notifySound.addEventListener('change', function(e) {
        e.stopPropagation();
        savePreferences({ notifySound: notifySound.value });
        showTip('通知音已设置为：' + (notifySound.options[notifySound.selectedIndex] || {}).text);
      });
    }

    if (notifyTest) {
      notifyTest.addEventListener('click', function(e) {
        e.stopPropagation();
        notifyTest.disabled = true;
        var original = notifyTest.textContent;
        notifyTest.textContent = '发送中...';
        requestBackend('/notify/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({})
        })
          .then(function(body) {
            showTip((body && body.message) || '测试通知已发送', !(body && body.ok));
          })
          .catch(function() {
            showTip('测试通知发送失败', true);
          })
          .finally(function() {
            notifyTest.disabled = false;
            notifyTest.textContent = original;
          });
      });
    }

    function renderUpdateInfo(info) {
      if (!updateHint) return;
      if (!info) {
        updateHint.textContent = '尚未检查';
        updateHint.style.color = '#94a3b8';
        return;
      }
      if (info.available && info.latestVersion) {
        updateHint.textContent = '发现新版本 v' + info.latestVersion + '，可下载';
        updateHint.style.color = '#2563eb';
        if (updateCheckBtn) updateCheckBtn.textContent = '下载更新';
        return;
      }
      if (info.error) {
        updateHint.textContent = '检查失败：' + String(info.error).slice(0, 60);
        updateHint.style.color = '#b45309';
      } else {
        updateHint.textContent = '已是最新（' + new Date(info.checkedAt).toLocaleTimeString() + '）';
        updateHint.style.color = '#94a3b8';
      }
      if (updateCheckBtn) updateCheckBtn.textContent = '检查更新';
    }

    if (updateCheckBtn) {
      updateCheckBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var hasUpdate = tokenStore.updateInfo && tokenStore.updateInfo.available;
        updateCheckBtn.disabled = true;
        var original = updateCheckBtn.textContent;
        updateCheckBtn.textContent = hasUpdate ? '下载中...' : '检查中...';

        var subPath = hasUpdate ? '/update/download' : '/update?force=1';
        var opts = hasUpdate
          ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }
          : { method: 'GET' };

        requestBackend(subPath, opts)
          .then(function(body) {
            if (hasUpdate) {
              showTip((body && body.message) || '下载完成', !(body && body.ok));
              if (body && body.installHint) {
                updateHint.textContent = body.installHint;
                updateHint.style.color = '#059669';
              }
            } else if (body && body.update) {
              tokenStore.updateInfo = body.update;
              renderUpdateInfo(body.update);
              if (body.update.available) showTip('发现新版本 v' + body.update.latestVersion);
              else showTip('当前已是最新版本');
            }
          })
          .catch(function() {
            showTip('更新操作失败，请检查网络', true);
          })
          .finally(function() {
            updateCheckBtn.disabled = false;
            if (updateCheckBtn.textContent === '下载中...' || updateCheckBtn.textContent === '检查中...') {
              updateCheckBtn.textContent = original;
            }
          });
      });
    }

    // 首次拉取偏好 + 最近一轮 + 版本号
    requestBackend('/settings', { method: 'GET' })
      .then(function(body) {
        if (body && body.preferences) applyPreferences(body.preferences);
        if (body && body.version && versionLabel) versionLabel.textContent = 'v' + body.version;
      })
      .catch(function() {});
    pollTurnReport();
    // 轮次复查：卡片展开时 6 秒一次，收起时 20 秒一次（省电且够用）
    (function scheduleTurnPoll() {
      setTimeout(function() {
        pollTurnReport();
        scheduleTurnPoll();
      }, isOpen ? 6000 : 20000);
    })();

    var isSettingsOpen = false;
    function renderIntervalTabsDOM() {
      var tabs = container.querySelectorAll('.yuyu-interval-tab');
      tabs.forEach(function(btn) {
        var val = btn.getAttribute('data-val');
        var isAct = (val === currentInterval);
        btn.style.cssText = [
          'flex:1;padding:4px 0;border:none;border-radius:5px;cursor:pointer;font-size:10.5px;transition:all 0.16s ease;',
          isAct
            ? 'background:#ffffff;color:#0f172a;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.08);'
            : 'background:transparent;color:#64748b;font-weight:500;'
        ].join('');
      });
      if (intervalHint) {
        intervalHint.textContent = '当前: ' + (INTERVAL_LABEL_MAP[currentInterval] || currentInterval);
      }
    }

    settingsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      isSettingsOpen = !isSettingsOpen;
      var gearSvg = settingsBtn.querySelector('svg');
      if (gearSvg) {
        gearSvg.style.transition = 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)';
        gearSvg.style.transform = isSettingsOpen ? 'rotate(60deg)' : 'none';
      }
      if (isSettingsOpen) {
        settingsPanel.style.maxHeight = '460px';
        settingsPanel.style.opacity = '1';
        settingsPanel.style.marginBottom = '6px';
      } else {
        settingsPanel.style.maxHeight = '0';
        settingsPanel.style.opacity = '0';
        settingsPanel.style.marginBottom = '0';
      }
    });

    var tutorialBtn = container.querySelector('#yuyu-open-tutorial-btn');
    if (tutorialBtn) {
      tutorialBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        requestBackend('/open-tutorial', {
          method: 'POST'
        }).then(function(res) {
          if (!res || !res.ok) {
            window.open('http://127.0.0.1:53788/yuyu-quota/api/tutorial', '_blank');
          }
        }).catch(function() {
          window.open('http://127.0.0.1:53788/yuyu-quota/api/tutorial', '_blank');
        });
      });
    }

    var intervalBtns = container.querySelectorAll('.yuyu-interval-tab');
    intervalBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var val = btn.getAttribute('data-val');
        if (!val || val === currentInterval) return;
        currentInterval = val;
        try { window.localStorage.setItem('dsh_yuyu_refresh_interval', currentInterval); } catch(err) {}
        renderIntervalTabsDOM();
        rescheduleTimer(true);
        requestBackend('/interval', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ interval: currentInterval })
        });
        showTip('刷新频率已设为: ' + (INTERVAL_LABEL_MAP[currentInterval] || currentInterval));
      });
    });

    renderIntervalTabsDOM();

    // 抽屉平滑阻尼折叠展开
    var isDrawerOpen = true;
    drawerToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      isDrawerOpen = !isDrawerOpen;
      if (isDrawerOpen) {
        drawerContent.classList.remove('collapsed');
        drawerArrow.classList.remove('collapsed');
      } else {
        drawerContent.classList.add('collapsed');
        drawerArrow.classList.add('collapsed');
      }
    });

    // 智能防封调度器
    var pollingTimer = null;
    function rescheduleTimer(isImmediate) {
      if (pollingTimer) {
        clearTimeout(pollingTimer);
        pollingTimer = null;
      }

      var effectiveMs = INTERVAL_MS_MAP[currentInterval] || 30000;
      // 智能防封策略：如果卡片收起静默中，且设定的频率快于 30秒，则后台自动降频为 30秒
      if (!isOpen && effectiveMs < 30000) {
        effectiveMs = 30000;
      }

      if (isImmediate) {
        fetchRemoteBalance(null, { syncBrowser: false });
      }

      pollingTimer = setTimeout(function tick() {
        fetchRemoteBalance(function() {
          rescheduleTimer(false);
        }, { syncBrowser: false });
      }, effectiveMs);
    }

    // 弹窗优雅从吸附方向呼出与隐藏
    pill.addEventListener('click', function(e) {
      e.stopPropagation();
      isOpen = !isOpen;
      if (isOpen) {
        card.classList.add('is-open');
        clearTurnBadge();
        pollTurnReport();
        fetchRemoteBalance(null, { syncBrowser: true });
        rescheduleTimer(true);
      } else {
        card.classList.remove('is-open');
        rescheduleTimer(false);
      }
    });

    card.addEventListener('click', function(e) { e.stopPropagation(); });
    document.addEventListener('click', function() {
      if (isOpen) {
        isOpen = false;
        card.classList.remove('is-open');
        rescheduleTimer(false);
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) {
        isOpen = false;
        card.classList.remove('is-open');
        rescheduleTimer(false);
      }
    });

    // 刷新按钮带贝塞尔轻微回弹旋转
    refreshBtn.addEventListener('click', function() {
      var icon = refreshBtn.querySelector('svg');
      if (icon) {
        icon.style.transition = 'transform 0.65s cubic-bezier(0.34, 1.3, 0.64, 1)';
        icon.style.transform = 'rotate(360deg)';
        setTimeout(function() {
          icon.style.transition = 'none';
          icon.style.transform = 'none';
        }, 650);
      }
      fetchRemoteBalance(function(data, err) {
        if (err) {
          showTip('刷新失败，当前显示 ' + formatSyncTime() + ' 的数据', true);
        } else {
          showTip('已刷新 ' + data.email + ' ($' + data.balance.toFixed(2) + ')');
        }
      }, { syncBrowser: false });
    });

    // 同步按钮
    syncBtn.addEventListener('click', function() {
      syncLabel.textContent = '正在同步...';
      syncBtn.disabled = true;
      fetchRemoteBalance(function(data, err, msg) {
        syncBtn.disabled = false;
        syncLabel.textContent = '从浏览器同步账号';
        if (err) {
          showTip('后端不可达，当前显示 ' + formatSyncTime() + ' 的数据', true);
        } else {
          showTip(msg || ('已同步账号: ' + data.email + ' ($' + data.balance.toFixed(2) + ')'));
        }
      }, { action: 'sync', forceCapture: false });
    });

    // 首次挂载立即检测一次浏览器最新账号，随后按调度器执行
    fetchRemoteBalance(null, { syncBrowser: true });
    rescheduleTimer(false);
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
          react.createElement('div', {
            key: 'header-actions',
            style: { display: 'flex', alignItems: 'center', gap: '8px' }
          }, [
            react.createElement('button', {
              key: 'tutorial-btn',
              onClick: function() {
                requestBackend('/open-tutorial', { method: 'POST' }).catch(function() {
                  window.open('http://127.0.0.1:53788/yuyu-quota/api/tutorial', '_blank');
                });
              },
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                color: '#2563eb',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer'
              }
            }, [
              react.createElement('span', {
                key: 'ico',
                style: { display: 'inline-flex' },
                dangerouslySetInnerHTML: { __html: SVG_BOOK }
              }),
              react.createElement('span', { key: 'txt' }, '使用教程')
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
          ])
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
