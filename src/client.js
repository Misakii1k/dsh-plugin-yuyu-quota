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
  var SVG_EXTERNAL_LINK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left:3px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
  var SVG_SUN = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
  var SVG_MOON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  var SVG_MONITOR = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>';

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

  function getAssetUrl(name) {
    if (typeof document !== 'undefined') {
      try {
        return new URL('yuyu-quota/api/assets/' + name, document.baseURI).href;
      } catch (e) {}
    }
    return BRIDGE_BASE + '/assets/' + name;
  }

  function playSound(soundKey, customVolume) {
    if (!soundKey || soundKey === 'none') return;
    var prefs = tokenStore.preferences || {};
    var volNum = typeof customVolume === 'number' ? customVolume : (typeof prefs.soundVolume === 'number' ? prefs.soundVolume : 80);
    var volume = Math.max(0, Math.min(1, volNum / 100));
    if (volume <= 0) return;

    var file = soundKey;
    if (soundKey === 'task-end-a') file = 'task-end-a.wav';
    else if (soundKey === 'cost-default') file = 'cost-default.wav';
    else if (soundKey === 'minecraft-exp-orb') file = 'minecraft-exp-orb.wav';
    else if (soundKey === 'duck') file = (Math.random() > 0.5 ? 'Ya1.mp3' : 'Ya2.mp3');
    else if (soundKey === 'fx1') file = (Math.random() > 0.5 ? 'D1.mp3' : 'D2.mp3');

    try {
      var audio = new Audio(getAssetUrl(file));
      audio.volume = volume;
      audio.play().catch(function() {
        var backup = new Audio(BRIDGE_BASE + '/assets/' + file);
        backup.volume = volume;
        backup.play().catch(function() {});
      });
    } catch (e) {}
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
    failCount: 0,
    /** 最近一次刷新失败的真实原因（用于给出可操作提示，而不是只显示「离线」） */
    lastError: '',
    /** 当前外观主题：'system' | 'light' | 'dark' */
    currentTheme: 'system',
    /** 挂件样式：'whale' 小鲸鱼立绘 | 'pill' 极简胶囊 */
    widgetStyle: 'whale',
    /** 登录凭据健康度（来自后端），用于提示「自动续期 / 需重新登录」 */
    credential: null,
    /** 小鲸鱼形象立绘：'DSniang1' | 'DSniang02' | 'DSH2' */
    whaleModel: 'DSniang1',
    /** 通知音效 */
    soundEffect: 'task-end-a',
    /** 按压音效 */
    pressSound: 'duck',
    /** 音量 0-100 */
    soundVolume: 80
  };

  /** 允许的小鲸鱼立绘（与后端 sanitizePreferences 的白名单保持一致） */
  var WHALE_MODELS = ['DSniang1'];
  /** 允许的提示音（避免 localStorage 被塞入任意值） */
  var SOUND_EFFECTS = ['task-end-a', 'cost-default', 'minecraft-exp-orb', 'duck', 'fx1', 'none'];

  try {
    var savedTheme = window.localStorage.getItem('dsh_yuyu_theme');
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
      tokenStore.currentTheme = savedTheme;
    }
    var savedWidgetStyle = window.localStorage.getItem('dsh_yuyu_widget_style');
    if (savedWidgetStyle === 'whale' || savedWidgetStyle === 'pill') {
      tokenStore.widgetStyle = savedWidgetStyle;
    }
    // 必须做白名单校验：这个值会被拼进 innerHTML 的 <img src>，
    // 若被写入 x" onerror="... 就会在 DSH 渲染进程里构成 DOM XSS。
    var savedWhaleModel = window.localStorage.getItem('dsh_yuyu_whale_model');
    if (savedWhaleModel && WHALE_MODELS.indexOf(savedWhaleModel) !== -1) {
      tokenStore.whaleModel = savedWhaleModel;
    }
    var savedSound = window.localStorage.getItem('dsh_yuyu_sound_effect');
    if (savedSound && SOUND_EFFECTS.indexOf(savedSound) !== -1) {
      tokenStore.soundEffect = savedSound;
    }
    var savedPress = window.localStorage.getItem('dsh_yuyu_press_sound');
    if (savedPress && SOUND_EFFECTS.indexOf(savedPress) !== -1) {
      tokenStore.pressSound = savedPress;
    }
  } catch (e) {}

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
    if (!tokenStore.fetchedAt) return '未同步';
    try {
      return new Date(tokenStore.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return new Date(tokenStore.fetchedAt).toLocaleTimeString();
    }
  }

  function formatSyncText() {
    if (!tokenStore.fetchedAt) return '未同步';
    return formatSyncTime() + ' 同步';
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
      if (typeof window.__yuyuRenderUpdateInfo === 'function') {
        try { window.__yuyuRenderUpdateInfo(body.update); } catch (e) {}
      }
    }
    if (body.credential && typeof body.credential === 'object') {
      tokenStore.credential = body.credential;
      if (typeof window.__yuyuRenderCredential === 'function') {
        try { window.__yuyuRenderCredential(body.credential); } catch (e) {}
      }
    } else if (body.credential === null) {
      tokenStore.credential = null;
      if (typeof window.__yuyuRenderCredential === 'function') {
        try { window.__yuyuRenderCredential(null); } catch (e) {}
      }
    }
    if (body.version) {
      tokenStore.version = body.version;
    }
    if (body.snapshot && body.snapshot.success) {
      applySnapshotFields(body.snapshot);
      tokenStore.online = true;
      tokenStore.failCount = 0;
      tokenStore.lastError = '';
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
      // 记录失败原因，让用户知道是「后端没起来」还是「凭据过期」
      var snapErr = body.snapshot && body.snapshot.error ? String(body.snapshot.error) : '';
      if (snapErr) tokenStore.lastError = snapErr;
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

  // 渲染卡片内的多账号切换（页眉右侧的短标签，只显示首字母缩写）
  // 账号多于三个时收进一个「+N」，避免把页眉挤爆。
  //
  // 这个函数每轮轮询都会跑一次。早期写法是每次 innerHTML='' 再全量重建，
  // 结果是每 30 秒白白丢掉并重造一批节点（点击态、焦点、hover 也一起没了）。
  // 现在按「账号列表 + 当前账号」生成一个指纹，指纹没变就只更新数字。
  var accountRowSignature = '';
  function renderAccountSwitcherDOM() {
    var rowEl = document.getElementById('yuyu-avatars-row');
    if (!rowEl) return;

    var accounts = (tokenStore.accounts || []).filter(function(a) { return a && a.email; });
    var signature = tokenStore.activeEmail + '|' + accounts.map(function(a) {
      return a.email + ':' + Number(typeof a.balance === 'number' ? a.balance : (a.snapshot ? a.snapshot.balance : 0)).toFixed(2);
    }).join(',');

    if (signature === accountRowSignature && rowEl.childNodes.length > 0) return;
    accountRowSignature = signature;

    rowEl.innerHTML = '';
    // 单账号时无需在顶栏渲染首字母胶囊，避免与左侧邮箱形成重复噪音
    if (accounts.length <= 1) return;

    function shortLabel(email) {
      var name = String(email).replace(/@.*/, '');
      return (name.slice(0, 2) || 'ID').toUpperCase();
    }

    function makeChip(acc) {
      var isActive = acc.email === tokenStore.activeEmail;
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'yuyu-avatar-chip' + (isActive ? ' active' : '');
      var balNum = typeof acc.balance === 'number' ? acc.balance : (acc.snapshot ? acc.snapshot.balance : 0);
      chip.title = acc.email + ' · $' + Number(balNum || 0).toFixed(2) + (isActive ? '（当前）' : '（点击切换）');
      chip.setAttribute('aria-label', chip.title);
      chip.textContent = shortLabel(acc.email);
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        if (acc.email === tokenStore.activeEmail) return;
        fetchRemoteBalance(function(d, _err, msg) {
          showTip(msg || ('已切换至 ' + d.email));
        }, { action: 'switch', email: acc.email });
      });
      return chip;
    }

    // 最多直接显示 3 个，其余折叠
    var visible = accounts.slice(0, 3);
    var hidden = accounts.slice(3);
    visible.forEach(function(acc) { rowEl.appendChild(makeChip(acc)); });

    if (hidden.length > 0) {
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'yuyu-avatar-chip';
      more.textContent = '+' + hidden.length;
      more.title = hidden.map(function(a) { return a.email; }).join('\n');
      more.addEventListener('click', function(e) {
        e.stopPropagation();
        showTip('还有 ' + hidden.length + ' 个账号：' + hidden.map(function(a) {
          return String(a.email).replace(/@.*/, '');
        }).join('、') + '（可在设置里管理）');
      });
      rowEl.appendChild(more);
    }
  }

  function showTip(text, isError) {
    var tip = document.getElementById('yuyu-sync-tip');
    if (!tip) return;
    tip.textContent = text;
    tip.style.color = isError ? 'var(--yp-danger)' : 'var(--yp-ok)';
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

  // 余额是否需要重建（首次渲染一定要建一次，否则小数位不会被压低）
  var balanceRendered = false;

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
      pillVal.style.color = isLow ? 'var(--yp-danger)' : 'var(--yp-ink)';
    }
    if (cardBal) {
      var nextBal = tokenStore.balance.toFixed(2);
      // 只有数值真的变了才播放跳动，否则每秒轮询都会闪一下
      if (!balanceRendered || cardBal.textContent !== nextBal) {
        // 整数部分突出，小数部分压低一级，让余额读起来是一个量而不是一串数字
        cardBal.innerHTML = '';
        var dotAt = nextBal.indexOf('.');
        var head = dotAt === -1 ? nextBal : nextBal.slice(0, dotAt);
        var tail = dotAt === -1 ? '' : nextBal.slice(dotAt);
        cardBal.appendChild(document.createTextNode(head));
        if (tail) {
          var dec = document.createElement('span');
          dec.className = 'yp-dec';
          dec.textContent = tail;
          cardBal.appendChild(dec);
        }
        balanceRendered = true;
        cardBal.classList.remove('is-animating');
        void cardBal.offsetWidth; // 触发 reflow 重置动画
        cardBal.classList.add('is-animating');
      }
    }
    if (cardRecharge) cardRecharge.textContent = '累计充值 $' + tokenStore.totalRecharged.toFixed(2);
    if (cardCost) cardCost.textContent = '$' + tokenStore.todayCost.toFixed(4);
    if (cardTokens) {
      cardTokens.textContent = formatTokens(tokenStore.todayTokens);
      cardTokens.title = tokenStore.todayTokens.toLocaleString() + ' Tokens';
    }
    if (cardKeys) cardKeys.textContent = tokenStore.keysCount + ' 个';
    if (syncTime) syncTime.textContent = '已同步 ' + tokenStore.lastSync;

    // 页眉账号 / 设置页账号
    var headMail = document.getElementById('yuyu-head-mail');
    if (headMail) {
      headMail.textContent = tokenStore.email || tokenStore.activeEmail || '未登录';
      headMail.title = tokenStore.email || tokenStore.activeEmail || '';
    }
    var settingsWho = document.getElementById('yuyu-settings-who');
    if (settingsWho) settingsWho.textContent = tokenStore.email || tokenStore.activeEmail || '未登录';

    // 页脚一行摘要：多少密钥、多久刷新一次、什么版本
    var footMeta = document.getElementById('yuyu-foot-meta');
    if (footMeta) {
      var bits = [];
      bits.push(tokenStore.keysCount + ' 个密钥');
      bits.push(tokenStore.online ? formatSyncText() : '离线');
      if (tokenStore.version) bits.push('v' + tokenStore.version);
      footMeta.textContent = bits.join(' · ');
    }

    // 连接状态：离线时不得伪装成绿色在线
    var connLabel = document.getElementById('yuyu-conn-label');
    var connWrap = document.getElementById('yuyu-conn-wrap');
    if (connLabel) {
      if (tokenStore.online) {
        connLabel.textContent = '就绪';
      } else if (tokenStore.lastError && /凭据|token|401|未授权|登录/i.test(tokenStore.lastError)) {
        connLabel.textContent = '凭据过期';
      } else {
        connLabel.textContent = '离线';
      }
    }
    if (connWrap) {
      connWrap.classList.toggle('off', !tokenStore.online);
      connWrap.title = tokenStore.online
        ? '本地直连就绪 · ' + (tokenStore.fetchedAt ? ('上次同步 ' + formatSyncTime()) : '等待初次同步')
        : '离线，当前显示 ' + (tokenStore.fetchedAt ? formatSyncTime() : '本地缓存') + ' 的数据';
    }

    var pillDot = document.getElementById('yuyu-pill-status-dot');
    if (pillDot) {
      if (!tokenStore.online) {
        pillDot.style.display = 'block';
        pillDot.style.background = 'var(--yp-warn)';
      } else if (tokenStore.lastError && /凭据|token|401|未授权|过期/i.test(tokenStore.lastError)) {
        pillDot.style.display = 'block';
        pillDot.style.background = '#ef4444';
      } else {
        pillDot.style.display = 'none';
      }
    }

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
  function snapToEdges(x, y, width, height, forceSideSnap) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var result = { x: x, y: y, edge: 'free' };

    if (forceSideSnap) {
      var midX = x + width / 2;
      if (midX < vw / 2) {
        result.x = 8;
        result.edge = 'left';
      } else {
        result.x = Math.max(8, vw - width - 8);
        result.edge = 'right';
      }
    } else if (x <= SNAP_DISTANCE) {
      result.x = 8;
      result.edge = 'left';
    } else if (x + width >= vw - SNAP_DISTANCE) {
      result.x = Math.max(8, vw - width - 8);
      result.edge = 'right';
    }

    if (y <= SNAP_DISTANCE) {
      result.y = 8;
    } else if (y + height >= vh - SNAP_DISTANCE) {
      result.y = vh - height - 8;
    } else {
      result.y = Math.max(8, Math.min(y, vh - height - 8));
    }

    return result;
  }

  /**
   * 给浮窗容器装上拖动能力。
   *
   * 支持 setHandle()：切换「小鲸鱼 ↔ 胶囊」时把手会变，旧实现只在挂载时绑定一次，
   * 结果切到胶囊后既拖不动、也收不到点击。现在拖动与点击都挂在「当前把手」上。
   *
   * @returns {{ applyPosition: Function, setHandle: Function, getEdge: Function, isDragging: Function, destroy: Function }}
   */
  function installDraggable(container, handle, options) {
    var opts = options || {};
    var onEdgeChange = opts.onEdgeChange || function() {};
    var onDragStateChange = opts.onDragStateChange || function() {};
    var state = { x: 0, y: 0, edge: 'free' };
    var drag = null;
    var suppressClick = false;
    var activeHandle = handle;

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

    // —— 把手上的监听器集中登记，切换把手时一并摘除，避免重复绑定 ——
    var handleListeners = [];

    function detachHandle() {
      if (!activeHandle) return;
      for (var i = 0; i < handleListeners.length; i++) {
        try {
          activeHandle.removeEventListener(handleListeners[i][0], handleListeners[i][1], handleListeners[i][2]);
        } catch (e) {}
      }
      handleListeners.length = 0;
    }

    function on(handleEl, type, fn, capture) {
      if (!handleEl) return;
      handleEl.addEventListener(type, fn, Boolean(capture));
      handleListeners.push([type, fn, Boolean(capture)]);
    }

    function onPointerDown(event) {
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
        activeHandle.setPointerCapture(event.pointerId);
      } catch (e) {}
    }

    function onPointerMove(event) {
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
    }

    function finishDrag(event) {
      if (!drag || (event && drag.pointerId !== event.pointerId)) return;
      var wasDrag = drag.moved;
      var elapsed = Date.now() - drag.startedAt;
      var pointerId = drag.pointerId;
      drag = null;

      try {
        activeHandle.releasePointerCapture(pointerId);
      } catch (e) {}

      if (!wasDrag) return;

      onDragStateChange(false);
      // 松手吸附（胶囊模式自动强制贴边）
      var snapped = snapToEdges(state.x, state.y, sizeOf().width, sizeOf().height, tokenStore.widgetStyle === 'pill');
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

    /** 点击拦截：拖拽刚结束时吞掉这次 click（capture 阶段，先于业务 click） */
    function onClickCapture(event) {
      if (suppressClick) {
        event.stopPropagation();
        event.preventDefault();
      }
    }

    function attachHandle(handleEl) {
      if (!handleEl) return;
      on(handleEl, 'pointerdown', onPointerDown);
      on(handleEl, 'pointermove', onPointerMove);
      on(handleEl, 'pointerup', finishDrag);
      on(handleEl, 'pointercancel', finishDrag);
      on(handleEl, 'click', onClickCapture, true);
      // 默认拖动手型；业务层可覆盖
      if (!handleEl.style.cursor) handleEl.style.cursor = 'grab';
    }

    function setHandle(handleEl) {
      detachHandle();
      activeHandle = handleEl;
      attachHandle(handleEl);
    }

    attachHandle(handle);

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
      setHandle: setHandle,
      getEdge: function() { return state.edge; },
      getPosition: function() { return { x: state.x, y: state.y, edge: state.edge }; },
      sizeOf: sizeOf,
      isDragging: function() { return Boolean(drag && drag.moved); },
      destroy: function() { detachHandle(); }
    };
  }

  // DOM 悬浮胶囊注入
  /**
   * 挂载浮窗。
   *
   * 幂等：已挂载就复用，不重复创建。
   * 早期版本每次调用都 `remove()` 旧容器再新建，但旧实例注册的
   * document/window 监听器、matchMedia 回调、轮次轮询定时器从不摘除 ——
   * 而挂载入口有两个（React 副作用 + apply()），每多挂一次就多一份轮询与监听，
   * 表现为「点一次关两次」「轮询翻倍」。现在统一走 destroy() 清理。
   */
  function mountDOMWidget() {
    if (typeof window.__yuyuWidgetDestroy === 'function') {
      try { window.__yuyuWidgetDestroy(); } catch (e) {}
    }
    var existing = document.getElementById('yuyu-quota-floating-container');
    if (existing) {
      existing.remove();
    }

    var container = document.createElement('div');
    container.id = 'yuyu-quota-floating-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:28px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;font-size:12px;user-select:none;pointer-events:auto;touch-action:none;';

    var html = [
      '<style>',
      '  #yuyu-quota-floating-container {',
      '    --yp-paper: #fcfcfb;',
      '    --yp-ink: #16181c;',
      '    --yp-ink2: #4a4f57;',
      '    --yp-muted: #5f656d;',
      '    --yp-faint: #6a7078;',
      '    --yp-hair: rgba(22, 24, 28, 0.09);',
      '    --yp-hair-soft: rgba(22, 24, 28, 0.055);',
      '    --yp-accent: #1d6f5b;',
      '    --yp-chip: rgba(22, 24, 28, 0.045);',
      '    --yp-seg: rgba(22, 24, 28, 0.055);',
      '    --yp-seg-on: #ffffff;',
      '    --yp-field: #ffffff;',
      '    --yp-shadow: 0 1px 2px rgba(22, 24, 28, 0.04), 0 18px 40px -18px rgba(22, 24, 28, 0.28);',
      '    --yp-svg-bubble-bg: #FFFFFF;',
      '    --yp-svg-bubble-stroke: #203170;',
      '    --yp-svg-label: #536ba9;',
      '    --yp-svg-amount: #059669;',
      '    --yp-svg-hint: #8da0cf;',
      '    --yp-ok: #1d6f5b;',
      '    --yp-warn: #b45309;',
      '    --yp-danger: #b0342a;',
      '  }',
      '  #yuyu-quota-floating-container.yuyu-dark {',
      '    --yp-paper: #1b2027;',
      '    --yp-ink: #eef1f5;',
      '    --yp-ink2: #c2cad4;',
      '    --yp-muted: #9aa4b1;',
      '    --yp-faint: #8d97a4;',
      '    --yp-hair: rgba(255, 255, 255, 0.11);',
      '    --yp-hair-soft: rgba(255, 255, 255, 0.06);',
      '    --yp-accent: #4bbd9b;',
      '    --yp-chip: rgba(255, 255, 255, 0.07);',
      '    --yp-seg: rgba(255, 255, 255, 0.07);',
      '    --yp-seg-on: #2b333d;',
      '    --yp-field: #232a33;',
      '    --yp-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 20px 44px -18px rgba(0, 0, 0, 0.75);',
      '    --yp-svg-bubble-bg: #1e293b;',
      '    --yp-svg-bubble-stroke: #3b82f6;',
      '    --yp-svg-label: #94a3b8;',
      '    --yp-svg-amount: #34d399;',
      '    --yp-svg-hint: #64748b;',
      '    --yp-ok: #4bbd9b;',
      '    --yp-warn: #f0b357;',
      '    --yp-danger: #ef8079;',
      '  }',
      '  @keyframes yuyuNumPop {',
      '    0% { transform: translateY(3px) scale(0.98); opacity: 0.55; }',
      '    60% { transform: translateY(-1px) scale(1.005); opacity: 1; }',
      '    100% { transform: translateY(0) scale(1); opacity: 1; }',
      '  }',
      '  /* 卡片呼出后，内容自上而下依次浮起一格：先看到余额，再看到账目，最后是操作 */',
      '  @keyframes yuyuRiseIn {',
      '    from { opacity: 0; transform: translateY(6px); }',
      '    to { opacity: 1; transform: translateY(0); }',
      '  }',
      '  /* 视图切换：资产向左退场，设置从右侧进来，方向本身就是层级提示 */',
      '  @keyframes yuyuViewInRight {',
      '    from { opacity: 0; transform: translateX(10px); }',
      '    to { opacity: 1; transform: translateX(0); }',
      '  }',
      '  @keyframes yuyuViewInLeft {',
      '    from { opacity: 0; transform: translateX(-10px); }',
      '    to { opacity: 1; transform: translateX(0); }',
      '  }',
      '  /* 小鲸鱼静息呼吸：极慢、极小，只让画面不显得死板 */',
      '  @keyframes yuyuFloat {',
      '    0%, 100% { transform: translateY(0); }',
      '    50% { transform: translateY(-3px); }',
      '  }',
      '  /* 进度条上的一道柔光，表示还在下载而不是卡住了 */',
      '  @keyframes yuyuShimmer {',
      '    from { transform: translateX(-110%); }',
      '    to { transform: translateX(210%); }',
      '  }',
      '  .yuyu-badge-dot {',
      '    position: absolute;',
      '    top: -2px;',
      '    right: -2px;',
      '    width: 7px;',
      '    height: 7px;',
      '    border-radius: 50%;',
      '    background: #ef4444;',
      '    box-shadow: 0 0 0 2px var(--yp-paper);',
      '    pointer-events: none;',
      '    z-index: 5;',
      '    animation: yuyuBadgePulse 2s infinite ease-in-out;',
      '  }',
      '  @keyframes yuyuBadgePulse {',
      '    0%, 100% { transform: scale(1); opacity: 1; }',
      '    50% { transform: scale(1.18); opacity: 0.88; }',
      '  }',
      '  #yuyu-pill-btn {',
      '    display: none; align-items: center; gap: 6px; padding: 6px 13px; border-radius: 999px;',
      '    background: var(--yp-paper); color: var(--yp-ink); border: 1px solid var(--yp-hair);',
      '    box-shadow: 0 3px 12px rgba(22,24,28,0.1); cursor: pointer;',
      '    transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.16s ease;',
      '  }',
      '  #yuyu-pill-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 18px -4px rgba(22,24,28,0.18); }',
      '  #yuyu-pill-btn:active { transform: scale(0.95); transition: transform 0.08s ease; }',
      '  #yuyu-whale-root { position: relative; width: 118px; height: 118px; cursor: pointer; transition: transform 0.22s ease; }',
      '  #yuyu-whale-root.yuyu-whale-flipped #yuyu-whale-body { transform: scaleX(-1); }',
      '  #yuyu-whale-body {',
      '    width: 100%; height: 100%; position: relative; transform-origin: 50% 100%;',
      '    transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);',
      '    animation: yuyuFloat 6.5s ease-in-out infinite;',
      '  }',
      '  /* 卡片展开时停住呼吸，避免和卡片抢注意力。',
      '     这里不用 :has()：Chromium 上它会让挂载时的样式重算慢 4 倍，',
      '     改由 setCardIsOpen 直接切一个类。 */',
      '  #yuyu-quota-floating-container.yuyu-card-open #yuyu-whale-body { animation-play-state: paused; }',
      '  #yuyu-whale-menu-btn {',
      '    transition: opacity 0.16s ease, transform 0.2s ease, color 0.16s ease;',
      '  }',
      '  #yuyu-quota-floating-container.yuyu-card-open #yuyu-whale-menu-btn {',
      '    opacity: 0; pointer-events: none; transform: scale(0.7);',
      '  }',
      '  @media (prefers-reduced-motion: reduce) {',
      '    #yuyu-whale-body { animation: none !important; }',
      '    #yuyu-card-popup.is-open #yuyu-view-main > *,',
      '    #yuyu-card-popup.is-open #yuyu-view-settings > *,',
      '    #yuyu-card-popup.yp-settings #yuyu-view-settings,',
      '    #yuyu-card-popup:not(.yp-settings) #yuyu-view-main { animation: none !important; }',
      '    #yuyu-card-bal.is-animating { animation: none !important; }',
      '  }',
      '  #yuyu-whale-img {',
      '    position: absolute; right: 0; bottom: 0; width: 100%; height: 100%; object-fit: contain;',
      '    pointer-events: auto; filter: drop-shadow(0 9px 16px rgba(22,24,28,0.2)); user-select: none; -webkit-user-drag: none;',
      '  }',
      '  #yuyu-whale-bubble {',
      '    position: absolute; bottom: 95px; right: -5px; width: 236px; height: 160px;',
      '    opacity: 0; transform: scale(0.85) translateY(12px); pointer-events: none; visibility: hidden;',
      '    transition: opacity 0.22s cubic-bezier(0.16,1,0.3,1), transform 0.22s cubic-bezier(0.16,1,0.3,1), visibility 0.22s;',
      '    z-index: 5;',
      '  }',
      '  #yuyu-whale-bubble.is-open { opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; visibility: visible; }',
      '  #yuyu-card-popup {',
      '    position: absolute; bottom: var(--yuyu-card-offset, 140px); width: 486px;',
      '    left: var(--yuyu-card-left, auto); right: var(--yuyu-card-right, 0);',
      '    background: var(--yp-paper); border: 1px solid var(--yp-hair); border-radius: 18px;',
      '    box-shadow: var(--yp-shadow); color: var(--yp-ink);',
      '    box-sizing: border-box; overflow: hidden;',
      '    transform-origin: var(--yuyu-origin-x, right) bottom;',
      '    opacity: 0; transform: scale(0.96) translateY(10px); pointer-events: none; visibility: hidden;',
      '    transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.2s;',
      '    z-index: 20;',
      '  }',
      '  #yuyu-card-popup.is-open { opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; visibility: visible; }',
      '  #yuyu-card-popup.clamp-to-edge { max-height: calc(100vh - 110px); overflow-y: auto; }',
      '  #yuyu-card-popup.flip-down {',
      '    bottom: auto; top: var(--yuyu-card-offset-down, 126px);',
      '    transform-origin: var(--yuyu-origin-x, right) top;',
      '    transform: scale(0.96) translateY(-10px);',
      '  }',
      '  #yuyu-card-popup.flip-down.is-open {',
      '    opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; visibility: visible;',
      '  }',
      '  /* 卡片内容分批入场，错开 40ms，读起来有先后而不是一坨同时出现 */',
      '  #yuyu-card-popup.is-open #yuyu-view-main > *,',
      '  #yuyu-card-popup.is-open #yuyu-view-settings > * {',
      '    animation: yuyuRiseIn 0.34s cubic-bezier(0.16, 1, 0.3, 1) backwards;',
      '  }',
      '  #yuyu-card-popup.is-open #yuyu-view-main > *:nth-child(1) { animation-delay: 0.02s; }',
      '  #yuyu-card-popup.is-open #yuyu-view-main > *:nth-child(2) { animation-delay: 0.06s; }',
      '  #yuyu-card-popup.is-open #yuyu-view-main > *:nth-child(3) { animation-delay: 0.1s; }',
      '  #yuyu-card-popup.is-open #yuyu-view-main > *:nth-child(4) { animation-delay: 0.13s; }',
      '  #yuyu-card-popup.is-open #yuyu-view-settings > *:nth-child(1) { animation-delay: 0.02s; }',
      '  #yuyu-card-popup.is-open #yuyu-view-settings > *:nth-child(2) { animation-delay: 0.06s; }',
      '  #yuyu-card-popup.is-open #yuyu-view-settings > *:nth-child(3) { animation-delay: 0.1s; }',
      '  #yuyu-card-popup.yp-settings #yuyu-view-settings { animation: yuyuViewInRight 0.24s cubic-bezier(0.16, 1, 0.3, 1); }',
      '  #yuyu-card-popup:not(.yp-settings) #yuyu-view-main { animation: yuyuViewInLeft 0.24s cubic-bezier(0.16, 1, 0.3, 1); }',
      '  .yp-head { display: flex; align-items: center; gap: 9px; padding: 15px 20px 0; }',
      '  .yp-mail { font-size: 12.5px; font-weight: 560; letter-spacing: -0.06px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '  .yp-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--yp-muted); white-space: nowrap; }',
      '  .yp-status i { width: 5px; height: 5px; border-radius: 50%; background: var(--yp-accent); box-shadow: 0 0 0 3px rgba(29,111,91,0.1); }',
      '  .yp-status.off i { background: var(--yp-warn); box-shadow: 0 0 0 3px rgba(180,83,9,0.12); }',
      '  .yp-sp { flex: 1; }',
      '  #yuyu-avatars-row { display: flex; align-items: center; gap: 1px; }',
      '  .yuyu-avatar-chip {',
      '    min-width: 24px; height: 22px; padding: 0 6px; border-radius: 6px;',
      '    display: inline-flex; align-items: center; justify-content: center; gap: 4px;',
      '    font-size: 10.5px; font-weight: 650; letter-spacing: 0.3px; color: var(--yp-muted);',
      '    cursor: pointer; background: transparent; border: none; user-select: none;',
      '    transition: background 0.16s ease, color 0.16s ease;',
      '  }',
      '  .yuyu-avatar-chip:hover { background: var(--yp-chip); color: var(--yp-ink2); }',
      '  .yuyu-avatar-chip.active { background: var(--yp-chip); color: var(--yp-ink); }',
      '  .yuyu-avatar-chip .yp-chav { display: none; }',
      '  .yuyu-avatar-chip .yp-cbal { font-variant-numeric: tabular-nums; font-weight: 620; }',
      '  .yp-main { display: flex; align-items: stretch; padding: 14px 20px 15px; }',
      '  .yp-left { flex: 1; min-width: 0; padding-right: 20px; }',
      '  .yp-label { font-size: 11px; letter-spacing: 0.12em; color: var(--yp-muted); font-weight: 500; }',
      '  #yuyu-card-bal { font-variant-numeric: tabular-nums; }',
      '  #yuyu-card-bal.is-animating { animation: yuyuNumPop 0.32s cubic-bezier(0.16, 1, 0.3, 1); }',
      '  .yp-amount { display: flex; align-items: baseline; font-size: 46px; line-height: 1.02; font-weight: 640; letter-spacing: -2.4px; margin-top: 4px; }',
      '  .yp-amount .yp-cur { font-size: 22px; font-weight: 560; letter-spacing: -0.3px; color: var(--yp-ink2); margin-right: 2px; }',
      '  .yp-amount .yp-dec { color: var(--yp-faint); }',
      '  .yp-sub { margin-top: 7px; font-size: 11.5px; color: var(--yp-muted); }',
      '  .yp-sub b { color: var(--yp-ink2); font-weight: 600; }',
      '  #yuyu-card-recharge { cursor: pointer; border-bottom: 1px dashed var(--yp-hair); }',
      '  #yuyu-card-recharge:hover { color: var(--yp-accent); border-bottom-color: var(--yp-accent); }',
      '  .yp-vrule { width: 1px; background: var(--yp-hair); margin: 5px 0 4px; flex-shrink: 0; }',
      '  .yp-right { width: 178px; flex-shrink: 0; padding-left: 22px; display: flex; flex-direction: column; justify-content: center; gap: 9px; }',
      '  .yp-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }',
      '  .yp-row .yp-k { font-size: 11.5px; color: var(--yp-muted); white-space: nowrap; }',
      '  .yp-row .yp-v { font-size: 13px; font-weight: 620; color: var(--yp-ink2); letter-spacing: -0.15px; white-space: nowrap; font-variant-numeric: tabular-nums; }',
      '  .yp-row .yp-v.em { color: var(--yp-ink); }',
      '  .yp-row .yp-v small { font-size: 10.5px; font-weight: 500; color: var(--yp-muted); margin-left: 2px; }',
      '  #yuyu-turn-panel { display: none; flex-direction: column; gap: 9px; padding-top: 8px; margin-top: 2px; border-top: 1px dashed var(--yp-hair); }',
      '  #yuyu-turn-panel .yp-v.is-anim { animation: yuyuNumPop 0.32s cubic-bezier(0.16, 1, 0.3, 1); }',
      '  .yp-foot { display: flex; align-items: center; gap: 8px; padding: 11px 20px 13px; border-top: 1px solid var(--yp-hair); }',
      '  .yp-meta { flex: 1; min-width: 0; font-size: 11px; color: var(--yp-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '  .yp-btn {',
      '    height: 30px; padding: 0 14px; border-radius: 9px; border: none;',
      '    display: inline-flex; align-items: center; justify-content: center; gap: 5px;',
      '    font-size: 12px; font-weight: 600; font-family: inherit; white-space: nowrap; cursor: pointer;',
      '    transition: transform 0.14s cubic-bezier(0.16,1,0.3,1), background 0.16s ease, border-color 0.16s ease;',
      '  }',
      '  .yp-btn:active { transform: scale(0.96); }',
      '  .yp-btn.ghost { color: var(--yp-ink2); background: transparent; border: 1px solid rgba(22,24,28,0.13); }',
      '  #yuyu-quota-floating-container.yuyu-dark .yp-btn.ghost { border-color: var(--yp-hair); }',
      '  .yp-btn.ghost:hover { background: var(--yp-chip); color: var(--yp-ink); }',
      '  .yp-btn.primary { color: var(--yp-paper); background: var(--yp-ink); }',
      '  #yuyu-quota-floating-container.yuyu-dark .yp-btn.primary { color: #12161b; background: #eef1f5; }',
      '  .yp-btn.primary:hover { filter: brightness(1.12); }',
      '  #yuyu-card-refresh, #yuyu-card-settings-btn {',
      '    position: relative;',
      '    width: 22px; height: 22px; padding: 0; border: none; border-radius: 6px; background: transparent;',
      '    color: var(--yp-muted); display: inline-flex; align-items: center; justify-content: center; cursor: pointer;',
      '    transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;',
      '  }',
      '  #yuyu-card-refresh:hover, #yuyu-card-settings-btn:hover { background: var(--yp-chip); color: var(--yp-ink); }',
      '  #yuyu-card-refresh:active, #yuyu-card-settings-btn:active { transform: scale(0.92); }',
      '  .yuyu-sync-tip {',
      '    font-size: 11px; text-align: center; padding: 0 20px; border-radius: 0;',
      '    background: transparent; color: var(--yp-ok); max-height: 0; opacity: 0; overflow: hidden;',
      '    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);',
      '  }',
      '  .yuyu-sync-tip.show { max-height: 34px; opacity: 1; padding: 6px 20px 8px; }',
      '  #yuyu-bubble-popup {',
      '    position: absolute; bottom: var(--yuyu-card-offset, 140px); width: 288px;',
      '    left: var(--yuyu-card-left, auto); right: var(--yuyu-card-right, 0);',
      '    background: var(--yp-paper); border: 1px solid var(--yp-hair); border-radius: 14px;',
      '    box-shadow: var(--yp-shadow); padding: 13px 14px; color: var(--yp-ink); box-sizing: border-box;',
      '    transform-origin: var(--yuyu-origin-x, right) bottom;',
      '    opacity: 0; transform: scale(0.94) translateY(10px); pointer-events: none; visibility: hidden;',
      '    transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.2s;',
      '    z-index: 10;',
      '  }',
      '  #yuyu-bubble-popup.is-open { opacity: 1; transform: scale(1) translateY(0); pointer-events: auto; visibility: visible; }',
      '  /* ---- 设置视图 ---- */',
      '  #yuyu-view-settings { display: none; }',
      '  #yuyu-card-popup.yp-settings #yuyu-view-main { display: none; }',
      '  #yuyu-card-popup.yp-settings #yuyu-view-settings { display: block; }',
      '  .yp-sethead { display: flex; align-items: center; gap: 6px; padding: 10px 14px 9px 10px; border-bottom: 1px solid var(--yp-hair-soft); }',
      '  #yuyu-settings-back {',
      '    width: 22px; height: 22px; border-radius: 6px; border: none; background: transparent;',
      '    display: grid; place-items: center; color: var(--yp-ink2); cursor: pointer; padding: 0; flex-shrink: 0;',
      '    transition: background 0.16s ease, color 0.16s ease;',
      '  }',
      '  #yuyu-settings-back:hover { background: var(--yp-chip); color: var(--yp-ink); }',
      '  .yp-settitle { font-size: 12.5px; font-weight: 620; letter-spacing: -0.1px; }',
      '  .yp-who { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--yp-muted); padding: 2px 7px 2px 6px; border-radius: 999px; background: var(--yp-chip); }',
      '  .yp-who i { width: 4px; height: 4px; border-radius: 50%; background: var(--yp-accent); }',
      '  .yp-cols { display: flex; align-items: stretch; }',
      '  .yp-col { flex: 1; min-width: 0; padding: 11px 0 8px; display: flex; flex-direction: column; }',
      '  .yp-col + .yp-col { border-left: 1px solid var(--yp-hair-soft); }',
      '  .yp-col .yp-fill { flex: 1; min-height: 2px; }',
      '  .yp-gname { font-size: 10.5px; letter-spacing: 0.1em; font-weight: 600; color: var(--yp-faint); padding: 0 14px; margin-bottom: 1px; }',
      '  .yp-gname.next { margin-top: 9px; }',
      '  .yp-srow { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 0 14px; }',
      '  .yp-srow .yp-sk { font-size: 11.5px; color: var(--yp-ink2); white-space: nowrap; flex-shrink: 0; }',
      '  .yp-srow .yp-hint { font-size: 10.5px; color: var(--yp-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '  .yp-srow .yp-push { flex: 1; }',
      '  .yp-seg { display: flex; gap: 1px; background: var(--yp-seg); border-radius: 7px; padding: 2px; flex-shrink: 0; }',
      '  .yp-seg button {',
      '    border: 0; background: transparent; font: inherit; font-size: 10.5px; font-weight: 560;',
      '    color: var(--yp-muted); padding: 3px 7px; border-radius: 5px; cursor: pointer;',
      '    display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;',
      '    transition: background 0.16s ease, color 0.16s ease;',
      '  }',
      '  .yp-seg button.on { background: var(--yp-seg-on); color: var(--yp-ink); font-weight: 620; box-shadow: 0 1px 2px rgba(22,24,28,0.11); }',
      '  .yp-sel {',
      '    display: inline-flex; align-items: center; gap: 4px; font-family: inherit; font-size: 11px; font-weight: 560;',
      '    color: var(--yp-ink); padding: 3px 6px 3px 8px; border-radius: 6px;',
      '    border: 1px solid var(--yp-hair); background: var(--yp-field); max-width: 132px; flex-shrink: 0;',
      '    outline: none; cursor: pointer; appearance: none; -webkit-appearance: none;',
      '    background-image: none; text-overflow: ellipsis;',
      '  }',
      '  .yp-mini {',
      '    position: relative;',
      '    display: inline-flex; align-items: center; justify-content: center; gap: 3px; font-family: inherit;',
      '    font-size: 10.5px; font-weight: 580; color: var(--yp-ink2);',
      '    padding: 3px 8px; border-radius: 6px; border: 1px solid var(--yp-hair); background: var(--yp-field);',
      '    white-space: nowrap; flex-shrink: 0; cursor: pointer;',
      '    transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;',
      '  }',
      '  .yp-mini:hover { background: var(--yp-chip); color: var(--yp-ink); }',
      '  #yuyu-notify-sound-row { display: flex; flex-direction: column; }',
      '  .yp-sw { width: 30px; height: 17px; border-radius: 999px; background: rgba(22,24,28,0.16); position: relative; flex-shrink: 0; border: none; padding: 0; cursor: pointer; transition: background 0.2s ease; }',
      '  #yuyu-quota-floating-container.yuyu-dark .yp-sw { background: rgba(255,255,255,0.18); }',
      '  .yp-sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(22,24,28,0.22); transition: left 0.2s cubic-bezier(0.16,1,0.3,1); }',
      '  .yp-sw.on { background: var(--yp-accent); }',
      '  .yp-sw.on::after { left: 15px; }',
      '  #yuyu-update-progress-box { display: none; flex-direction: column; gap: 5px; padding: 2px 14px 4px; }',
      '  .yp-progline { display: flex; align-items: center; gap: 8px; }',
      '  .yp-bar { height: 3px; border-radius: 2px; background: rgba(22,24,28,0.085); overflow: hidden; flex: 1; min-width: 40px; }',
      '  #yuyu-quota-floating-container.yuyu-dark .yp-bar { background: rgba(255,255,255,0.12); }',
      '  #yuyu-progress-bar { display: block; height: 100%; width: 0%; background: var(--yp-accent); border-radius: 2px; transition: width 0.2s ease, background 0.2s ease; position: relative; overflow: hidden; }',
      '  #yuyu-progress-bar::after {',
      '    content: ""; position: absolute; inset: 0;',
      '    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent);',
      '    animation: yuyuShimmer 1.35s ease-in-out infinite;',
      '  }',
      '  #yuyu-update-progress-box.done #yuyu-progress-bar::after,',
      '  #yuyu-update-progress-box.failed #yuyu-progress-bar::after { animation: none; opacity: 0; }',
      '  #yuyu-progress-status { font-size: 10.5px; color: var(--yp-muted); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '  #yuyu-progress-percent { font-size: 10.5px; color: var(--yp-ink2); font-weight: 600; flex-shrink: 0; font-variant-numeric: tabular-nums; }',
      '  #yuyu-agent-running-warn { font-size: 10.5px; color: var(--yp-warn); line-height: 1.45; }',
      '  #yuyu-credential-row { display: none; }',
      '  .yp-setfoot { display: flex; align-items: center; gap: 6px; padding: 9px 12px 10px 14px; border-top: 1px solid var(--yp-hair); }',
      '  .yp-setfoot .yp-meta { text-align: right; padding-right: 2px; font-size: 10.5px; color: var(--yp-faint); }',
      '  .yp-setfoot .yp-btn { height: 26px; padding: 0 11px; font-size: 11px; border-radius: 7px; }',
      '  svg { display: block; }',
      '</style>',
      // ===================== 小鲸鱼挂件 =====================
      '<div id="yuyu-whale-root" style="display:' + (tokenStore.widgetStyle === 'whale' ? 'block' : 'none') + ';">',
      '  <div id="yuyu-whale-body">',
      '    <img id="yuyu-whale-img" src="' + getAssetUrl((tokenStore.whaleModel || 'DSniang1') + '.png') + '" alt="小鲸鱼" />',
      '  </div>',
      '  <button id="yuyu-whale-menu-btn" type="button" aria-label="打开设置" style="position:absolute;top:0;right:-7px;background:var(--yp-paper);border:1px solid var(--yp-hair);border-radius:50%;width:23px;height:23px;display:flex;align-items:center;justify-content:center;color:var(--yp-muted);cursor:pointer;z-index:2;box-shadow:0 1px 3px rgba(22,24,28,0.08);padding:0;transition:color 0.16s ease, transform 0.2s ease;">' + SVG_SETTINGS + '</button>',
      '  <div id="yuyu-whale-bubble">',
      '    <svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;overflow:visible;filter:drop-shadow(0 10px 24px rgba(22,24,28,0.16));">',
      '      <path class="yuyu-svg-bshape" fill="var(--yp-svg-bubble-bg)" stroke="var(--yp-svg-bubble-stroke)" stroke-width="20" stroke-linejoin="round" stroke-linecap="round" d="M 827 248 A 373 232 0 1 0 81 246 A 373 232 0 0 0 301 465 A 57 32 10 0 0 413 484 A 373 232 0 0 0 827 248 Z" />',
      '      <ellipse class="yuyu-svg-b1" cx="352" cy="561" rx="37.5" ry="26" fill="var(--yp-svg-bubble-bg)" stroke="var(--yp-svg-bubble-stroke)" stroke-width="20" />',
      '      <ellipse class="yuyu-svg-b2" cx="442" cy="646" rx="24.5" ry="18" fill="var(--yp-svg-bubble-bg)" stroke="var(--yp-svg-bubble-stroke)" stroke-width="20" />',
      '    </svg>',
      '    <div style="position:absolute;left:44%;top:38%;transform:translate(-50%,-50%);width:72%;text-align:center;pointer-events:auto;cursor:pointer;">',
      '      <div id="yuyu-whale-bubble-title" style="font-size:11px;font-weight:600;color:var(--yp-svg-label);letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">鱼鱼 API 可用余额</div>',
      '      <div id="yuyu-whale-bubble-amount" style="font-size:24px;font-weight:800;color:var(--yp-svg-amount);line-height:1.15;margin:3px 0;font-variant-numeric:tabular-nums;">$' + tokenStore.balance.toFixed(2) + '</div>',
      '      <div id="yuyu-whale-bubble-hint" style="font-size:9.5px;color:var(--yp-svg-hint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">点击查看完整资产卡片</div>',
      '    </div>',
      '    <button id="yuyu-whale-bubble-close" type="button" aria-label="关闭余额气泡" style="position:absolute;top:22px;right:46px;background:none;border:none;color:var(--yp-svg-label);cursor:pointer;padding:2px;display:flex;align-items:center;justify-content:center;opacity:0.75;">' + SVG_CLOSE + '</button>',
      '  </div>',
      '</div>',
      // ===================== 胶囊形态 =====================
      '<div id="yuyu-pill-btn" role="button" tabindex="0">',
      '  <span id="yuyu-pill-icon" style="display:inline-flex;color:var(--yp-muted);position:relative;">' + SVG_WALLET +
      '    <i id="yuyu-pill-status-dot" style="display:none;position:absolute;top:-1px;right:-2px;width:5px;height:5px;border-radius:50%;background:var(--yp-warn);box-shadow:0 0 0 1.5px var(--yp-paper);"></i>' +
      '  </span>',
      '  <span style="font-weight:560;font-size:11px;color:var(--yp-muted);letter-spacing:0.2px;">鱼鱼</span>',
      '  <span id="yuyu-pill-val" style="color:var(--yp-ink);font-weight:650;font-variant-numeric:tabular-nums;font-size:12.5px;">$' + tokenStore.balance.toFixed(2) + '</span>',
      '</div>',
      // ===================== 应用内通知气泡 =====================
      '<div id="yuyu-bubble-popup">',
      '  <div style="display:flex;align-items:center;gap:6px;margin-bottom:9px;">',
      '    <span style="display:inline-flex;color:var(--yp-accent);flex-shrink:0;">' + SVG_BELL + '</span>',
      '    <span id="yuyu-bubble-title" style="flex:1;min-width:0;font-size:12px;font-weight:600;color:var(--yp-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">任务完成</span>',
      '    <button id="yuyu-bubble-close" type="button" aria-label="关闭" style="background:transparent;border:none;padding:2px;cursor:pointer;color:var(--yp-muted);display:inline-flex;border-radius:4px;">' + SVG_CLOSE + '</button>',
      '  </div>',
      '  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--yp-muted);">',
      '    <span>本轮消耗</span>',
      '    <span id="yuyu-bubble-quota" style="font-weight:650;color:var(--yp-ink);font-variant-numeric:tabular-nums;">$0.0000</span>',
      '  </div>',
      '  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--yp-muted);margin-top:4px;">',
      '    <span id="yuyu-bubble-tokens" style="font-variant-numeric:tabular-nums;color:var(--yp-ink2);">0 Tokens</span>',
      '    <span>扣后 <span id="yuyu-bubble-balance" style="font-weight:620;color:var(--yp-ink);font-variant-numeric:tabular-nums;">$' + tokenStore.balance.toFixed(2) + '</span></span>',
      '  </div>',
      '  <div style="display:flex;justify-content:flex-end;margin-top:10px;">',
      '    <button id="yuyu-bubble-view" type="button" class="yp-mini" style="border:none;background:var(--yp-ink);color:var(--yp-paper);">查看详情</button>',
      '  </div>',
      '</div>',
      // ===================== 主卡片 =====================
      '<div id="yuyu-card-popup">',
      // —— 视图一：资产 ——
      '  <div id="yuyu-view-main">',
      '    <div class="yp-head">',
      '      <span class="yp-mail" id="yuyu-head-mail">—</span>',
      '      <span id="yuyu-conn-wrap" class="yp-status"><i></i><span id="yuyu-conn-label">未连接</span></span>',
      '      <span class="yp-sp"></span>',
      '      <div id="yuyu-avatars-row"></div>',
      '      <button id="yuyu-card-refresh" type="button" aria-label="刷新数据" title="刷新数据">' + SVG_REFRESH + '</button>',
      '      <button id="yuyu-card-settings-btn" type="button" aria-label="打开设置" title="设置">' + SVG_SETTINGS + '</button>',
      '    </div>',
      '    <div class="yp-main">',
      '      <div class="yp-left">',
      '        <div class="yp-label">可用余额</div>',
      '        <div class="yp-amount"><span class="yp-cur">$</span><span id="yuyu-card-bal">' + tokenStore.balance.toFixed(2) + '</span></div>',
      '        <div class="yp-sub"><span id="yuyu-card-recharge" title="点击前往充值页面">累计充值 $' + tokenStore.totalRecharged.toFixed(2) + '</span></div>',
      '      </div>',
      '      <div class="yp-vrule"></div>',
      '      <div class="yp-right">',
      '        <div class="yp-row"><span class="yp-k">今日实扣</span><span class="yp-v em" id="yuyu-card-cost">$' + tokenStore.todayCost.toFixed(4) + '</span></div>',
      '        <div class="yp-row"><span class="yp-k">今日 Tokens</span><span class="yp-v" id="yuyu-card-tokens">' + tokenStore.todayTokens.toLocaleString() + '</span></div>',
      '        <div id="yuyu-turn-panel">',
      '          <div class="yp-row"><span class="yp-k">本轮实扣</span><span class="yp-v em" id="yuyu-turn-quota">—</span></div>',
      '          <div class="yp-row"><span class="yp-k">本轮 Tokens</span><span class="yp-v" id="yuyu-turn-tokens">—</span></div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div class="yp-foot">',
      '      <span class="yp-meta" id="yuyu-foot-meta">—</span>',
      '      <button id="yuyu-card-sync" type="button" class="yp-btn ghost" title="从浏览器读取最新登录账号">',
      '        <span style="display:inline-flex;">' + SVG_BROWSER + '</span>',
      '        <span id="yuyu-sync-label">同步</span>',
      '      </button>',
      '      <button id="yuyu-open-topup" type="button" class="yp-btn primary">充值</button>',
      '    </div>',
      '    <div id="yuyu-sync-tip" class="yuyu-sync-tip"></div>',
      // 兼容旧节点：数据仍由一个隐藏区承载，避免后端字段无处可写
      '    <div style="display:none;">',
      '      <span id="yuyu-card-keys">' + tokenStore.keysCount + '</span>',
      '      <span id="yuyu-session-total">—</span>',
      '      <span id="yuyu-turn-meta"></span>',
      '      <span id="yuyu-sync-time">' + tokenStore.lastSync + '</span>',
      '      <div id="yuyu-credential-row">',
      '        <span id="yuyu-credential-dot"></span>',
      '        <span id="yuyu-credential-label"></span>',
      '        <span id="yuyu-credential-hint"></span>',
      '        <button id="yuyu-credential-refresh" type="button"></button>',
      '      </div>',
      '    </div>',
      '  </div>',
      // —— 视图二：设置 ——
      '  <div id="yuyu-view-settings">',
      '    <div class="yp-sethead">',
      '      <button id="yuyu-settings-back" type="button" aria-label="返回">',
      '        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
      '      </button>',
      '      <span class="yp-settitle">设置</span>',
      '      <span class="yp-sp"></span>',
      '      <span class="yp-who"><i></i><span id="yuyu-settings-who">—</span></span>',
      '    </div>',
      '    <div class="yp-cols">',
      // 左栏
      '      <div class="yp-col">',
      '        <div class="yp-gname">外观</div>',
      '        <div class="yp-srow"><span class="yp-sk">主题</span><span class="yp-push"></span>',
      '          <span class="yp-seg" id="yuyu-theme-tabs">',
      '            <button type="button" class="yuyu-theme-tab" data-val="system">系统</button>',
      '            <button type="button" class="yuyu-theme-tab" data-val="light">浅</button>',
      '            <button type="button" class="yuyu-theme-tab" data-val="dark">深</button>',
      '          </span>',
      '        </div>',
      '        <div class="yp-srow"><span class="yp-sk">挂件</span><span class="yp-push"></span>',
      '          <span class="yp-seg" id="yuyu-style-tabs">',
      '            <button type="button" class="yuyu-style-tab" data-val="whale">小鲸鱼</button>',
      '            <button type="button" class="yuyu-style-tab" data-val="pill">胶囊</button>',
      '          </span>',
      '        </div>',

      '        <div class="yp-gname next">刷新</div>',
      '        <div class="yp-srow"><span class="yp-sk">频率</span><span class="yp-push"></span>',
      '          <span class="yp-seg" id="yuyu-interval-tabs">',
      '            <button type="button" class="yuyu-interval-tab" data-val="1s">1秒</button>',
      '            <button type="button" class="yuyu-interval-tab" data-val="5s">5秒</button>',
      '            <button type="button" class="yuyu-interval-tab" data-val="30s">30秒</button>',
      '            <button type="button" class="yuyu-interval-tab" data-val="1m">1分</button>',
      '            <button type="button" class="yuyu-interval-tab" data-val="5m">5分</button>',
      '          </span>',
      '        </div>',
      '        <div class="yp-srow"><span class="yp-sk">静默</span><span class="yp-push"></span><span class="yp-hint">卡片收起时降到 30 秒</span></div>',
      '        <div class="yp-fill"></div>',
      '      </div>',
      // 右栏
      '      <div class="yp-col">',
      '        <div class="yp-gname">提醒</div>',
      '        <div class="yp-srow"><span class="yp-sk">完成时通知</span><span class="yp-push"></span>',
      '          <button type="button" class="yp-sw" id="yuyu-notify-switch" role="switch" aria-checked="true" aria-label="完成时通知"></button>',
      '        </div>',
      '        <div class="yp-srow"><span class="yp-sk">方式</span><span class="yp-push"></span>',
      '          <select id="yuyu-notify-mode" class="yp-sel">',
      '            <option value="both">系统 + 应用内</option>',
      '            <option value="windows">仅系统</option>',
      '            <option value="inapp">仅应用内</option>',
      '            <option value="off">关闭</option>',
      '          </select>',
      '        </div>',
      '        <div id="yuyu-notify-sound-row">',
      '          <div class="yp-srow"><span class="yp-sk">完成音</span><span class="yp-push"></span>',
      '            <select id="yuyu-sound-effect" class="yp-sel" style="max-width:104px;">',
      '              <option value="task-end-a">任务完成</option>',
      '              <option value="cost-default">扣费消耗</option>',
      '              <option value="minecraft-exp-orb">经验球</option>',
      '              <option value="none">静音</option>',
      '            </select>',
      '            <button id="yuyu-sound-test" type="button" class="yp-mini">试听</button>',
      '          </div>',
      '          <div class="yp-srow"><span class="yp-sk">按压音</span><span class="yp-push"></span>',
      '            <select id="yuyu-press-sound" class="yp-sel" style="max-width:104px;">',
      '              <option value="duck">小黄鸭</option>',
      '              <option value="fx1">咚咚声</option>',
      '              <option value="none">静音</option>',
      '            </select>',
      '            <button id="yuyu-press-test" type="button" class="yp-mini">试听</button>',
      '          </div>',
      '          <div class="yp-srow"><span class="yp-sk">桌面推送</span><span class="yp-push"></span>',
      '            <button id="yuyu-notify-test" type="button" class="yp-mini" style="max-width:104px;">测试通知</button>',
      '          </div>',
      '        </div>',
      '        <div class="yp-gname next">版本</div>',
      '        <div class="yp-srow"><span class="yp-sk">当前</span><span class="yp-hint" id="yuyu-version-label">v' + (tokenStore.version || '—') + '</span><span class="yp-push"></span>',
      '          <span class="yp-hint" id="yuyu-update-hint" style="max-width:96px;">尚未检查</span>',
      '          <button id="yuyu-update-check" type="button" class="yp-mini">检查更新</button>',
      '        </div>',
      '        <div id="yuyu-update-progress-box">',
      '          <div class="yp-progline"><span class="yp-bar"><span id="yuyu-progress-bar"></span></span><span id="yuyu-progress-percent">0%</span></div>',
      '          <div id="yuyu-progress-status">正在准备下载...</div>',
      '          <div id="yuyu-agent-running-warn" style="display:none;"></div>',
      '        </div>',
      '        <div class="yp-fill"></div>',
      '      </div>',
      '    </div>',
      '    <div class="yp-setfoot">',
      '      <button id="yuyu-open-tutorial-btn" type="button" class="yp-mini">' + SVG_BOOK + '<span>教程</span></button>',
      '      <span class="yp-meta" id="yuyu-settings-foot">改动立即生效</span>',
      '      <button id="yuyu-settings-done" type="button" class="yp-btn primary">完成</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');

    container.innerHTML = html;
    document.body.appendChild(container);

    var pill = container.querySelector('#yuyu-pill-btn');
    var whaleRoot = container.querySelector('#yuyu-whale-root');
    var whaleBody = container.querySelector('#yuyu-whale-body');
    var whaleImg = container.querySelector('#yuyu-whale-img');
    var whaleBubble = container.querySelector('#yuyu-whale-bubble');
    var whaleBubbleClose = container.querySelector('#yuyu-whale-bubble-close');
    var whaleBubbleTitle = container.querySelector('#yuyu-whale-bubble-title');
    var whaleBubbleAmount = container.querySelector('#yuyu-whale-bubble-amount');
    var whaleBubbleHint = container.querySelector('#yuyu-whale-bubble-hint');
    var whaleMenuBtn = container.querySelector('#yuyu-whale-menu-btn');

    var bubblePopup = container.querySelector('#yuyu-bubble-popup');
    var bubbleClose = container.querySelector('#yuyu-bubble-close');
    var bubbleView = container.querySelector('#yuyu-bubble-view');
    var bubbleTitle = container.querySelector('#yuyu-bubble-title');
    var bubbleQuota = container.querySelector('#yuyu-bubble-quota');
    var bubbleTokens = container.querySelector('#yuyu-bubble-tokens');
    var bubbleBalance = container.querySelector('#yuyu-bubble-balance');

    var card = container.querySelector('#yuyu-card-popup');
    var syncBtn = container.querySelector('#yuyu-card-sync');
    var refreshBtn = container.querySelector('#yuyu-card-refresh');
    var settingsBtn = container.querySelector('#yuyu-card-settings-btn');
    var settingsBackBtn = container.querySelector('#yuyu-settings-back');
    var settingsDoneBtn = container.querySelector('#yuyu-settings-done');
    var notifySwitch = container.querySelector('#yuyu-notify-switch');
    var topupBtn = container.querySelector('#yuyu-open-topup');
    var syncLabel = container.querySelector('#yuyu-sync-label');
    var cardRecharge = container.querySelector('#yuyu-card-recharge');

    var styleTabs = container.querySelectorAll('.yuyu-style-tab');
    var whaleModelSelect = container.querySelector('#yuyu-whale-model');
    var themeTabs = container.querySelectorAll('.yuyu-theme-tab');
    var notifyModeSelect = container.querySelector('#yuyu-notify-mode');
    var soundEffectSelect = container.querySelector('#yuyu-sound-effect');
    var pressSoundSelect = container.querySelector('#yuyu-press-sound');

    // 拖动把手支持（胶囊或小鲸鱼）：把手随形态切换，切换时由 applyWidgetStyle 调 setHandle
    var isOpen = false;
    var activeHandle = tokenStore.widgetStyle === 'whale' ? whaleRoot : pill;
    var draggable = installDraggable(container, activeHandle, {
      onEdgeChange: function(edge) {
        container.style.setProperty('--yuyu-card-left', edge === 'left' ? '0' : 'auto');
        container.style.setProperty('--yuyu-card-right', edge === 'left' ? 'auto' : '0');
        container.style.setProperty('--yuyu-origin-x', edge === 'left' ? 'left' : 'right');
        updateCardPlacement();
        if (whaleRoot) {
          if (edge === 'left') whaleRoot.classList.add('yuyu-whale-flipped');
          else whaleRoot.classList.remove('yuyu-whale-flipped');
        }
      },
      onDragStateChange: function(dragging) {
        if (activeHandle) activeHandle.style.cursor = dragging ? 'grabbing' : 'grab';
        if (dragging) {
          if (isOpen) {
            isOpen = false;
            card.classList.remove('is-open');
            if (container) container.classList.remove('yuyu-card-open');
          }
          if (whaleBubble) whaleBubble.classList.remove('is-open');
          if (bubblePopup) bubblePopup.classList.remove('is-open');
        }
      }
    });
    draggable.restore();
    function openCard() {
      setCardIsOpen(true);
    }

    function closeCard() {
      setCardIsOpen(false);
    }

    function toggleCard() {
      setCardIsOpen(!isOpen);
    }

    /**
     * 唯一的「卡片开关」实现。
     * 早期版本把开关逻辑复制了三份（openCard / whale dblclick / pill click），
     * 其中两处还各自 toggle 自己的 isOpen，互相抵消 —— 这是「切胶囊后点不开」的根因。
     * 现在所有入口都只改这一个状态。
     */
    function updateCardPlacement() {
      if (!card || !container) return;
      var rect = container.getBoundingClientRect();
      var isSettings = card.classList.contains('yp-settings');
      var neededHeight = isSettings ? 370 : 230;
      var offsetUp = tokenStore.widgetStyle === 'whale' ? 132 : 44;
      var spaceAbove = rect.top - offsetUp;
      var spaceBelow = window.innerHeight - rect.bottom - (tokenStore.widgetStyle === 'whale' ? 126 : 38);
      var shouldFlipDown = spaceAbove < neededHeight && spaceBelow >= spaceAbove;
      card.classList.toggle('flip-down', shouldFlipDown);
    }

    function setCardIsOpen(next) {
      var target = Boolean(next);
      // 容器上的这个类只管「小鲸鱼停止呼吸」，和卡片开合一一对应
      if (container) container.classList.toggle('yuyu-card-open', target);
      if (target === isOpen) {
        // 状态没变也要保证 DOM 类名与状态一致（防止外部误改类名）
        if (target) { card.classList.add('is-open'); updateCardPlacement(); }
        else card.classList.remove('is-open');
        return;
      }
      isOpen = target;
      if (isOpen) {
        updateCardPlacement();
        if (whaleBubble) whaleBubble.classList.remove('is-open');
        if (bubblePopup) bubblePopup.classList.remove('is-open');
        card.classList.add('is-open');
        clearTurnBadge();
        // 展开卡片时静默拉取更新状态以刷新红点
        requestBackend('/update', { method: 'GET' })
          .then(function(b) {
            if (b && b.update) {
              tokenStore.updateInfo = b.update;
              if (typeof window.__yuyuRenderUpdateInfo === 'function') {
                window.__yuyuRenderUpdateInfo(b.update);
              }
            }
          })
          .catch(function() {});
      } else {
        card.classList.remove('is-open');
      }
      // 卡片开合与轮询频率联动：开卡时立即刷新一次并加密轮询
      if (typeof rescheduleTimer === 'function') rescheduleTimer(isOpen);
    }

    // 切换形态 (Whale vs Pill)
    function applyWidgetStyle(style) {
      if (!style) style = 'whale';
      tokenStore.widgetStyle = style;
      // 记住用户是否手动选过形态，用于区分「默认 whale」与「主动选 whale」
      try { window.localStorage.setItem('dsh_yuyu_widget_style', style); } catch (e) {}

      if (whaleRoot) whaleRoot.style.display = style === 'whale' ? 'block' : 'none';
      if (pill) pill.style.display = style === 'pill' ? 'inline-flex' : 'none';

      // 卡片必须落在挂件上方，而不是盖住它：
      // 小鲸鱼 118px 高，留 12px 呼吸位；胶囊只有 32px 高，跟着一起收紧。
      if (container) {
        container.style.setProperty('--yuyu-card-offset', style === 'whale' ? '132px' : '44px');
        container.style.setProperty('--yuyu-card-offset-down', style === 'whale' ? '126px' : '38px');
      }
      updateCardPlacement();

      // 关键：拖动把手必须跟着换，否则切到胶囊后既拖不动也点不到
      activeHandle = style === 'whale' ? whaleRoot : pill;
      if (draggable && typeof draggable.setHandle === 'function') {
        draggable.setHandle(activeHandle);
      }
      // 容器尺寸随形态变化，重新钳制一次，避免胶囊留在小鲸鱼的位置
      if (draggable && typeof draggable.applyPosition === 'function') {
        var pos = draggable.getPosition();
        if (style === 'pill') {
          var sz = typeof draggable.sizeOf === 'function' ? draggable.sizeOf() : { width: 120, height: 32 };
          var snapped = snapToEdges(pos.x, pos.y, sz.width, sz.height, true);
          draggable.applyPosition(snapped, true);
          writeStoredPosition(snapped);
        } else {
          draggable.applyPosition(pos, false);
        }
      }

      styleTabs.forEach(function(tab) {
        tab.classList.toggle('on', tab.getAttribute('data-val') === style);
      });
    }

    // 切换小鲸鱼形象
    function applyWhaleModel(model) {
      // 后端/本地存储都可能传脏值，这里再收敛一次（值会被拼进 img src）
      if (WHALE_MODELS.indexOf(model) === -1) model = 'DSniang1';
      tokenStore.whaleModel = model;
      try { window.localStorage.setItem('dsh_yuyu_whale_model', model); } catch (e) {}
      if (whaleImg) whaleImg.src = getAssetUrl(model + '.png');
      if (whaleModelSelect) whaleModelSelect.value = model;
    }

    // 外观主题切换 (系统 / 浅色 / 深色)
    function applyTheme(theme) {
      if (!theme) theme = 'system';
      tokenStore.currentTheme = theme;
      try { window.localStorage.setItem('dsh_yuyu_theme', theme); } catch (e) {}

      var isDark = false;
      if (theme === 'dark') isDark = true;
      else if (theme === 'light') isDark = false;
      else isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

      if (container) {
        if (isDark) container.classList.add('yuyu-dark');
        else container.classList.remove('yuyu-dark');
      }

      themeTabs.forEach(function(tab) {
        tab.classList.toggle('on', tab.getAttribute('data-val') === theme);
      });
    }

    if (window.matchMedia) {
      var mql = window.matchMedia('(prefers-color-scheme: dark)');
      var onThemeChange = function() {
        if (tokenStore.currentTheme === 'system') applyTheme('system');
      };
      if (mql.addEventListener) mql.addEventListener('change', onThemeChange);
      else if (mql.addListener) mql.addListener(onThemeChange);
    }

    // 充值一键跳转
    if (cardRecharge) {
      cardRecharge.addEventListener('click', function(e) {
        e.stopPropagation();
        showTip('正在前往充值页面…');
        requestBackend('/open-topup', { method: 'POST' }).catch(function() {
          window.open('https://sub.anzhiyu.com/recharge-center', '_blank');
        });
      });
    }

    // 小鲸鱼立绘按压与交互
    if (whaleRoot) {
      whaleRoot.addEventListener('pointerdown', function() {
        if (whaleBody) whaleBody.style.transform = 'scaleY(0.88) scaleX(1.05)';
        playSound(tokenStore.pressSound || 'duck');
      });
      var endPress = function() {
        if (whaleBody) whaleBody.style.transform = 'scaleY(1) scaleX(1)';
      };
      whaleRoot.addEventListener('pointerup', endPress);
      whaleRoot.addEventListener('pointercancel', endPress);

      whaleRoot.addEventListener('click', function(e) {
        if (draggable.isDragging()) return;
        if (e.target === whaleMenuBtn || (whaleMenuBtn && whaleMenuBtn.contains(e.target))) return;
        if (e.target === whaleBubbleClose || (whaleBubbleClose && whaleBubbleClose.contains(e.target))) return;

        // 点击小鲸鱼：切换气泡显示，并静默刷新一次余额
        if (whaleBubble && whaleBubble.classList.contains('is-open')) {
          whaleBubble.classList.remove('is-open');
        } else {
          showWhaleBubble('鱼鱼 API 可用余额', '$' + tokenStore.balance.toFixed(2), '今日已扣 $' + tokenStore.todayCost.toFixed(4) + ' · 双击展开卡片');
          fetchRemoteBalance();
        }
      });

      whaleRoot.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        openCard();
      });
    }

    if (whaleMenuBtn) {
      whaleMenuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleCard();
      });
    }

    if (whaleBubble) {
      whaleBubble.addEventListener('click', function(e) {
        if (e.target === whaleBubbleClose || (whaleBubbleClose && whaleBubbleClose.contains(e.target))) return;
        e.stopPropagation();
        openCard();
      });
    }

    if (whaleBubbleClose) {
      whaleBubbleClose.addEventListener('click', function(e) {
        e.stopPropagation();
        if (whaleBubble) whaleBubble.classList.remove('is-open');
      });
    }

    function showWhaleBubble(title, amount, hint) {
      if (!whaleBubble) return;
      if (whaleBubbleTitle) whaleBubbleTitle.textContent = title || '鱼鱼 API';
      if (whaleBubbleAmount) whaleBubbleAmount.textContent = amount || '$0.00';
      if (whaleBubbleHint) whaleBubbleHint.textContent = hint || '点击查看详情';
      whaleBubble.classList.add('is-open');
    }

    function showPillBubble(report) {
      if (!bubblePopup || !report) return;
      if (bubbleTitle) bubbleTitle.textContent = report.sessionTitle || (report.reason === 'completed' ? '任务完成' : '任务结束');
      if (bubbleQuota) bubbleQuota.textContent = formatQuotaText(report);
      if (bubbleTokens) bubbleTokens.textContent = (report.tokens ? report.tokens.totalTokens.toLocaleString() : '0') + ' Tokens';
      if (bubbleBalance) bubbleBalance.textContent = '$' + (report.balanceAfter !== undefined ? report.balanceAfter.toFixed(2) : tokenStore.balance.toFixed(2));
      bubblePopup.classList.add('is-open');
    }

    if (bubbleClose) {
      bubbleClose.addEventListener('click', function(e) {
        e.stopPropagation();
        bubblePopup.classList.remove('is-open');
      });
    }

    if (bubbleView) {
      bubbleView.addEventListener('click', function(e) {
        e.stopPropagation();
        openCard();
      });
    }

    // 胶囊点击：统一由 openCardAndSync / closeCardAndReschedule 处理（见下方 togglePillCard），
    // 此处不再单独绑定 —— 历史上这里和后面各绑了一次，两次 toggle 互相抵消，
    // 导致「切到胶囊后点不开卡片」。

    // 设置项切换绑定
    styleTabs.forEach(function(tab) {
      tab.addEventListener('click', function(e) {
        e.stopPropagation();
        var val = tab.getAttribute('data-val');
        applyWidgetStyle(val);
        savePreferences({ widgetStyle: val });
      });
    });

    if (whaleModelSelect) {
      whaleModelSelect.addEventListener('change', function(e) {
        e.stopPropagation();
        applyWhaleModel(whaleModelSelect.value);
        savePreferences({ whaleModel: whaleModelSelect.value });
      });
    }

    themeTabs.forEach(function(tab) {
      tab.addEventListener('click', function(e) {
        e.stopPropagation();
        var val = tab.getAttribute('data-val');
        applyTheme(val);
        savePreferences({ theme: val });
      });
    });

    if (notifyModeSelect) {
      notifyModeSelect.addEventListener('change', function(e) {
        e.stopPropagation();
        savePreferences({ notifyMode: notifyModeSelect.value });
        if (typeof syncNotifySwitch === 'function') syncNotifySwitch();
        showTip('通知方式：' + notifyModeSelect.options[notifyModeSelect.selectedIndex].text);
      });
    }

    if (soundEffectSelect) {
      soundEffectSelect.addEventListener('change', function(e) {
        e.stopPropagation();
        tokenStore.soundEffect = soundEffectSelect.value;
        savePreferences({ soundEffect: soundEffectSelect.value });
        playSound(soundEffectSelect.value);
        showTip('完成音效已更换，正在试听…');
      });
    }

    if (pressSoundSelect) {
      pressSoundSelect.addEventListener('change', function(e) {
        e.stopPropagation();
        tokenStore.pressSound = pressSoundSelect.value;
        savePreferences({ pressSound: pressSoundSelect.value });
        playSound(pressSoundSelect.value);
        showTip('按压音效已更换，正在试听…');
      });
    }

    updateUI();
    applyWidgetStyle(tokenStore.widgetStyle);
    applyWhaleModel(tokenStore.whaleModel);
    applyTheme(tokenStore.currentTheme);
    if (tokenStore.updateInfo) renderUpdateInfo(tokenStore.updateInfo);
    // 恢复上次已知的凭据状态（详细值随后端首包刷新）
    if (tokenStore.credential) renderCredential(tokenStore.credential);

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

    /** 轮询后端最近一轮汇报；seq 变化时刷新并亮起角标与弹气泡 */
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
            var report = body.lastTurn;
            var prefs = tokenStore.preferences || {};
            var mode = prefs.notifyMode || (prefs.notifyOnComplete !== false ? 'both' : 'off');
            if (mode === 'both' || mode === 'inapp') {
              if (mode === 'inapp') {
                playSound(tokenStore.soundEffect || 'task-end-a');
              }
              if (tokenStore.widgetStyle === 'whale') {
                showWhaleBubble('任务完成 · 本轮消耗', '-' + formatQuotaText(report), 'Tokens: ' + (report.tokens ? report.tokens.totalTokens.toLocaleString() : '0') + ' · 余额: $' + (report.balanceAfter !== undefined ? report.balanceAfter.toFixed(2) : tokenStore.balance.toFixed(2)));
              } else {
                showPillBubble(report);
              }
            }
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
      if (pill) pill.appendChild(badge);
    }

    function clearTurnBadge() {
      hasTurnBadge = false;
      var badge = document.getElementById('yuyu-turn-badge');
      if (badge) badge.remove();
    }

    // ===================== 设置：通知 / 更新 =====================
    var notifyTest = container.querySelector('#yuyu-notify-test');
    var soundTestBtn = container.querySelector('#yuyu-sound-test');
    var pressTestBtn = container.querySelector('#yuyu-press-test');
    var versionLabel = container.querySelector('#yuyu-version-label');
    var updateHint = container.querySelector('#yuyu-update-hint');
    var updateCheckBtn = container.querySelector('#yuyu-update-check');
    var progressBox = container.querySelector('#yuyu-update-progress-box');
    var progressStatus = container.querySelector('#yuyu-progress-status');
    var progressPercent = container.querySelector('#yuyu-progress-percent');
    var progressBar = container.querySelector('#yuyu-progress-bar');
    var agentRunningWarn = container.querySelector('#yuyu-agent-running-warn');

    function applyPreferences(prefs) {
      if (!prefs) return;
      tokenStore.preferences = prefs;
      if (prefs.theme) applyTheme(prefs.theme);
      if (prefs.widgetStyle) applyWidgetStyle(prefs.widgetStyle);
      if (prefs.whaleModel) applyWhaleModel(prefs.whaleModel);
      if (prefs.soundEffect) {
        tokenStore.soundEffect = prefs.soundEffect;
        if (soundEffectSelect) soundEffectSelect.value = prefs.soundEffect;
      }
      if (prefs.pressSound) {
        tokenStore.pressSound = prefs.pressSound;
        if (pressSoundSelect) pressSoundSelect.value = prefs.pressSound;
      }
      if (prefs.notifyMode) {
        if (notifyModeSelect) notifyModeSelect.value = prefs.notifyMode;
      }
      syncNotifySwitch();
      renderTurnReport(tokenStore.lastTurn);
    }

    /**
     * 通知开关是「通知方式」的一个快捷入口：
     * 开 = 记住关掉之前的模式，关 = off。两者必须双向同步，
     * 否则用户在下拉里改成 off 后，开关还亮着。
     */
    function currentNotifyMode() {
      if (notifyModeSelect && notifyModeSelect.value) return notifyModeSelect.value;
      var prefs = tokenStore.preferences || {};
      return prefs.notifyMode || (prefs.notifyOnComplete !== false ? 'both' : 'off');
    }

    function syncNotifySwitch() {
      if (!notifySwitch) return;
      var on = currentNotifyMode() !== 'off';
      notifySwitch.classList.toggle('on', on);
      notifySwitch.setAttribute('aria-checked', on ? 'true' : 'false');
      // 关掉时也把音效行压暗，让「不会响」这件事一眼可见
      var soundRow = container.querySelector('#yuyu-notify-sound-row');
      if (soundRow) soundRow.style.opacity = on ? '1' : '0.45';
    }

    if (notifySwitch) {
      notifySwitch.addEventListener('click', function(e) {
        e.stopPropagation();
        var turningOn = currentNotifyMode() === 'off';
        var next = turningOn ? (tokenStore.preferences && tokenStore.preferences.lastNotifyMode) || 'both' : 'off';
        if (notifyModeSelect) notifyModeSelect.value = next;
        if (!turningOn) {
          // 记住关掉前的模式，下次打开恢复原样
          savePreferences({ lastNotifyMode: currentNotifyMode() });
        }
        savePreferences({ notifyMode: next });
        syncNotifySwitch();
        showTip(turningOn ? '任务完成后会提醒' : '已关闭完成提醒');
      });
    }

    // 暴露给 applyBackendPayload（它在 mountDOMWidget 作用域之外）
    window.__yuyuApplyPreferences = applyPreferences;
    window.__yuyuRenderTurnReport = renderTurnReport;
    // 只给测试用：让性能自检能直接驱动一次真实渲染，而不是复制一份逻辑
    window.__yuyuUpdateUIForPerf = updateUI;

    // ===================== 登录凭据状态 =====================
    var credRow = container.querySelector('#yuyu-credential-row');
    var credDot = container.querySelector('#yuyu-credential-dot');
    var credLabel = container.querySelector('#yuyu-credential-label');
    var credHint = container.querySelector('#yuyu-credential-hint');
    var credRefreshBtn = container.querySelector('#yuyu-credential-refresh');

    function formatRemaining(ms) {
      if (typeof ms !== 'number' || !isFinite(ms)) return '';
      if (ms <= 0) return '已过期';
      var hours = ms / 3600000;
      if (hours >= 48) return Math.floor(hours / 24) + ' 天';
      if (hours >= 1) return hours.toFixed(1).replace(/\.0$/, '') + ' 小时';
      return Math.max(1, Math.round(ms / 60000)) + ' 分钟';
    }

    /**
     * 渲染凭据健康度。
     *
     * 用户最关心两件事：
     * 1. 现在还能不能自动续期（不用我重新登录）；
     * 2. 如果不行了，我该点什么。
     */
    function renderCredential(cred) {
      if (!credRow) return;
      if (!cred) {
        credRow.style.display = 'none';
        return;
      }
      credRow.style.display = 'block';

      var auto = cred.mode === 'auto' && cred.hasRefreshToken;
      var expired = typeof cred.msUntilExpiry === 'number' && cred.msUntilExpiry <= 0;
      var urgent = auto && typeof cred.msUntilExpiry === 'number' && cred.msUntilExpiry < 3600000;

      var color = auto ? (urgent ? '#d97706' : '#10b981') : '#dc2626';
      if (credDot) credDot.style.background = color;
      if (credLabel) {
        credLabel.style.color = auto ? 'var(--yuyu-muted-text)' : '#dc2626';
        credLabel.textContent = auto ? '登录凭据 · 可自动续期' : '登录凭据 · 需重新登录';
      }

      if (credHint) {
        var lines = [];
        if (auto) {
          var left = formatRemaining(cred.msUntilExpiry);
          lines.push(expired
            ? '当前 token 已到期，下次刷新会自动续期。'
            : '当前 token 剩余 ' + left + (urgent ? '，即将自动续期。' : '，到期前会自动续期，无需重新登录。'));
          if (cred.lastRefreshedAt) {
            lines.push('上次续期 ' + new Date(cred.lastRefreshedAt).toLocaleTimeString());
          }
        } else {
          lines.push('未保存 refresh token，token 过期后需要重新登录 sub.anzhiyu.com 并点「从浏览器同步」。');
        }
        credHint.textContent = lines.join(' ');
        credHint.style.color = auto ? 'var(--yuyu-muted-text)' : '#b91c1c';
      }

      // 没有 refresh token，或 token 已过期时才需要用户介入
      if (credRefreshBtn) {
        credRefreshBtn.style.display = (!auto || expired) ? 'inline-block' : 'none';
      }
    }

    window.__yuyuRenderCredential = renderCredential;
    applyPreferences.lastCredential = null;

    if (credRefreshBtn) {
      credRefreshBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        credRefreshBtn.disabled = true;
        var original = credRefreshBtn.textContent;
        credRefreshBtn.textContent = '续期中...';
        requestBackend('/credential/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: tokenStore.activeEmail })
        })
          .then(function(body) {
            if (body && body.credential) renderCredential(body.credential);
            showTip((body && body.message) || '续期完成', !(body && body.ok));
          })
          .catch(function() {
            showTip('续期请求失败，请检查后端连接', true);
          })
          .finally(function() {
            credRefreshBtn.disabled = false;
            credRefreshBtn.textContent = original;
          });
      });
    }

    // 试听完成音效
    if (soundTestBtn) {
      soundTestBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var key = soundEffectSelect ? soundEffectSelect.value : (tokenStore.soundEffect || 'task-end-a');
        if (key === 'none') {
          showTip('当前完成音为静音');
          return;
        }
        playSound(key);
        showTip('正在试听完成音效…');
      });
    }

    // 试听按压音效
    if (pressTestBtn) {
      pressTestBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var key = pressSoundSelect ? pressSoundSelect.value : (tokenStore.pressSound || 'duck');
        if (key === 'none') {
          showTip('当前按压音为静音');
          return;
        }
        playSound(key);
        showTip('正在试听按压音效…');
      });
    }

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

    if (notifyTest) {
      notifyTest.addEventListener('click', function(e) {
        e.stopPropagation();
        var prefs = tokenStore.preferences || {};
        var mode = prefs.notifyMode || (prefs.notifyOnComplete !== false ? 'both' : 'off');
        if (mode === 'off') {
          showTip('当前通知模式为「关闭」，请先开启', true);
          return;
        }

        // 应用内弹出测试气泡
        if (tokenStore.widgetStyle === 'whale') {
          showWhaleBubble('测试通知 · 本轮消耗', '-$0.0123', 'Tokens: 12,345 · 余额: $' + tokenStore.balance.toFixed(2));
        } else {
          showPillBubble({
            sessionTitle: '测试通知 · 鱼鱼配额插件',
            quota: 0.0123,
            quotaSource: 'actual',
            tokens: { totalTokens: 12345 },
            balanceAfter: tokenStore.balance
          });
        }

        // 若仅为应用内模式，直接在网页播放声音
        if (mode === 'inapp') {
          playSound(tokenStore.soundEffect || 'task-end-a');
          showTip('应用内测试气泡已弹出');
          return;
        }

        // 若包含系统通知，调用后端（系统推送伴随播放所选完成音，避免双重叠音）
        if (mode === 'both' || mode === 'windows') {
          notifyTest.disabled = true;
          var original = notifyTest.textContent;
          notifyTest.textContent = '发送中...';
          requestBackend('/notify/test', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ soundEffect: tokenStore.soundEffect || 'task-end-a' })
          })
            .then(function(b) {
              showTip((b && b.message) || '测试通知已发送', !(b && b.ok));
            })
            .catch(function() {
              showTip('测试通知发送失败', true);
            })
            .finally(function() {
              notifyTest.disabled = false;
              notifyTest.textContent = original;
            });
        } else {
          showTip('应用内测试气泡已弹出');
        }
      });
    }

    function updateBadgeDisplay(hasUpdate) {
      // 1. 卡片右上角设置按钮红点
      if (settingsBtn) {
        var existingCardDot = settingsBtn.querySelector('.yuyu-badge-dot');
        if (hasUpdate) {
          if (!existingCardDot) {
            var dot = document.createElement('span');
            dot.className = 'yuyu-badge-dot';
            settingsBtn.appendChild(dot);
          }
        } else if (existingCardDot) {
          existingCardDot.remove();
        }
      }

      // 2. 设置面板内【检查更新/下载更新】按钮右上角红点
      if (updateCheckBtn) {
        var existingBtnDot = updateCheckBtn.querySelector('.yuyu-badge-dot');
        if (hasUpdate) {
          if (!existingBtnDot) {
            var dot2 = document.createElement('span');
            dot2.className = 'yuyu-badge-dot';
            updateCheckBtn.appendChild(dot2);
          }
        } else if (existingBtnDot) {
          existingBtnDot.remove();
        }
      }
    }

    function renderUpdateInfo(info) {
      var hasUpdate = Boolean(info && info.available && info.latestVersion);
      updateBadgeDisplay(hasUpdate);

      if (!updateHint) return;
      if (!info) {
        updateHint.textContent = '尚未检查更新';
        updateHint.style.color = '#94a3b8';
        return;
      }
      if (hasUpdate) {
        updateHint.textContent = '检测到最新版本 v' + info.latestVersion + '，可下载更新';
        updateHint.style.color = '#2563eb';
        if (updateCheckBtn) updateCheckBtn.textContent = '下载更新';
        return;
      }
      if (info.error) {
        updateHint.textContent = '检查失败：' + String(info.error).slice(0, 60);
        updateHint.style.color = '#b45309';
      } else {
        updateHint.textContent = '您当前已是最新版本（' + new Date(info.checkedAt).toLocaleTimeString() + '）';
        updateHint.style.color = '#10b981';
      }
      if (updateCheckBtn) updateCheckBtn.textContent = '检查更新';
    }

    window.__yuyuRenderUpdateInfo = renderUpdateInfo;
    window.__yuyuUpdateBadgeDisplay = updateBadgeDisplay;

    if (updateCheckBtn) {
      updateCheckBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var hasUpdate = tokenStore.updateInfo && tokenStore.updateInfo.available;
        updateCheckBtn.disabled = true;
        var original = updateCheckBtn.textContent;

        if (!hasUpdate) {
          // 1. 检查更新
          updateCheckBtn.textContent = '检查中...';
          requestBackend('/update?force=1', { method: 'GET' })
            .then(function(body) {
              if (body && body.update) {
                tokenStore.updateInfo = body.update;
                tokenStore.agentRunning = !!body.agentRunning;
                renderUpdateInfo(body.update);
                if (body.update.available) {
                  showTip('检测到最新版本 v' + body.update.latestVersion + '，可点击下载更新');
                  if (body.agentRunning && agentRunningWarn) {
                    agentRunningWarn.style.display = 'block';
                    if (progressBox) progressBox.style.display = 'block';
                  }
                } else {
                  showTip('您当前已是最新版本');
                }
              }
            })
            .catch(function() {
              showTip('检查更新失败，请检查网络', true);
            })
            .finally(function() {
              updateCheckBtn.disabled = false;
              if (updateCheckBtn.textContent === '检查中...') {
                updateCheckBtn.textContent = original;
              }
            });
          return;
        }

        // 2. 发现新版本 -> 实时显示进度条下载并自动安装
        updateCheckBtn.textContent = '下载安装中...';
        if (progressBox) {
          progressBox.style.display = 'flex';
          progressBox.classList.remove('done', 'failed');
        }
        if (progressBar) {
          progressBar.style.width = '0%';
          progressBar.style.background = '';
        }
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressStatus) {
          progressStatus.textContent = '正在连接下载源...';
          progressStatus.style.color = '';
        }

        // 进度条平滑增长（兼容旧后端未提供 progress 路由的场景）
        var simPercent = 10;
        var pollTimer = setInterval(function() {
          requestBackend('/update/progress', { method: 'GET' })
            .then(function(res) {
              if (res && res.agentRunning && agentRunningWarn) {
                agentRunningWarn.style.display = 'block';
              }
              if (res && res.progress && res.progress.percent !== undefined) {
                if (progressBar) progressBar.style.width = res.progress.percent + '%';
                if (progressPercent) progressPercent.textContent = res.progress.percent + '%';
                if (progressStatus && res.progress.status) progressStatus.textContent = res.progress.status;
              }
            })
            .catch(function() {
              // 旧版后端无 /update/progress 时的平滑进度兜底
              if (simPercent < 85) {
                simPercent += Math.floor(Math.random() * 8) + 4;
                if (simPercent > 85) simPercent = 85;
                if (progressBar) progressBar.style.width = simPercent + '%';
                if (progressPercent) progressPercent.textContent = simPercent + '%';
                if (progressStatus) progressStatus.textContent = '正在下载更新包... (' + simPercent + '%)';
              }
            });
        }, 150);

        requestBackend('/update/download', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({})
        })
          .then(function(body) {
            clearInterval(pollTimer);
            if (body && body.ok) {
              if (progressBar) {
                progressBar.style.width = '100%';
                progressBar.style.background = 'var(--yp-accent)';
              }
              if (progressPercent) progressPercent.textContent = '100%';
              if (progressBox) progressBox.classList.add('done');
              if (progressStatus) {
                progressStatus.textContent = '下载并安装完成';
                progressStatus.style.color = 'var(--yp-ok)';
              }

              if (body.agentRunning) {
                if (agentRunningWarn) {
                  agentRunningWarn.style.display = 'block';
                  agentRunningWarn.textContent = '⚠️ 检测到当前有 Agent 正在运行任务，新版本已就绪，请在当前任务完成后重启 DSH 生效。';
                }
                showTip('新版本已就绪！检测到任务运行中，请在完成后重启 DSH 生效。');
              } else {
                showTip('新版本已自动安装完成！请重启 DeepSeek-Harness 生效。');
              }

              if (updateHint) {
                updateHint.textContent = '更新安装完成，请重启 DSH 生效';
                updateHint.style.color = '#059669';
              }
              updateBadgeDisplay(false);
              updateCheckBtn.textContent = '请重启生效';
              updateCheckBtn.disabled = true;
            } else {
              if (progressBar) progressBar.style.background = 'var(--yp-danger)';
              if (progressBox) progressBox.classList.add('failed');
              if (progressStatus) {
                progressStatus.textContent = '更新失败：' + ((body && body.error) || (body && body.message) || '下载未成功');
                progressStatus.style.color = 'var(--yp-danger)';
              }
              showTip('更新失败：' + ((body && body.error) || (body && body.message) || '网络异常'), true);
              updateCheckBtn.disabled = false;
              updateCheckBtn.textContent = '重试更新';
            }
          })
          .catch(function(err) {
            clearInterval(pollTimer);
            if (progressBar) progressBar.style.background = 'var(--yp-danger)';
            if (progressBox) progressBox.classList.add('failed');
            if (progressStatus) {
              progressStatus.textContent = '下载安装失败，请检查网络';
              progressStatus.style.color = 'var(--yp-danger)';
            }
            showTip('更新操作失败，请重试', true);
            updateCheckBtn.disabled = false;
            updateCheckBtn.textContent = '重试更新';
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
    // 句柄必须可取消：早期版本这条自递归 setTimeout 永不停止，
    // 重新挂载一次就多一条轮询链。
    var turnPollTimer = null;
    (function scheduleTurnPoll() {
      turnPollTimer = setTimeout(function() {
        pollTurnReport();
        scheduleTurnPoll();
      }, isOpen ? 6000 : 20000);
    })();

    // ===================== 视图切换：资产 ⇄ 设置 =====================
    // 卡片只有固定宽度，设置项放进来会把高度撑爆；改成整块换视图，
    // 两种视图各自都能在一屏内看完，也不再需要展开动画和高度测量。
    var isSettingsView = false;
    function setSettingsView(next) {
      isSettingsView = Boolean(next);
      card.classList.toggle('yp-settings', isSettingsView);
      updateCardPlacement();
      if (isSettingsView) {
        // 换视图后容器宽度不变、高度变了，重新钳制一次位置
        if (draggable && typeof draggable.applyPosition === 'function') {
          try { draggable.applyPosition(draggable.getPosition(), false); } catch (e) {}
        }
      }
    }

    function renderIntervalTabsDOM() {
      var tabs = container.querySelectorAll('.yuyu-interval-tab');
      tabs.forEach(function(btn) {
        btn.classList.toggle('on', btn.getAttribute('data-val') === currentInterval);
      });
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        setSettingsView(true);
      });
    }
    if (settingsBackBtn) {
      settingsBackBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        setSettingsView(false);
      });
    }
    if (settingsDoneBtn) {
      settingsDoneBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        setSettingsView(false);
      });
    }
    // 在卡片任意处按下 Esc 回资产视图，再按一次才关卡片（键盘用户不至于一次跳太远）
    if (card) {
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isSettingsView) {
          e.stopPropagation();
          setSettingsView(false);
        }
      });
    }
    if (topupBtn) {
      topupBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showTip('正在前往充值页面…');
        requestBackend('/open-topup', { method: 'POST' }).catch(function() {
          window.open('https://sub.anzhiyu.com/recharge-center', '_blank');
        });
      });
    }

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

    // 弹窗优雅从吸附方向呼出与隐藏：统一走 setCardIsOpen（唯一切换入口）
    if (pill) {
      pill.addEventListener('click', function(e) {
        e.stopPropagation();
        if (draggable.isDragging()) return;
        setCardIsOpen(!isOpen);
        if (isOpen) {
          pollTurnReport();
          fetchRemoteBalance(null, { syncBrowser: true });
        }
      });
    }

    card.addEventListener('click', function(e) { e.stopPropagation(); });

    // —— 全局监听器与定时器登记 ——
    // 早期版本把 document/window 的监听器和轮询定时器直接挂上就再也不摘：
    // 插件热重载或浮窗重新挂载时，它们会一层层累积（表现为点击一次关两次、轮询翻倍）。
    // 现在统一登记，销毁时一次性清理。
    var globalCleanups = [];
    function registerGlobalCleanup(fn) {
      if (typeof fn === 'function') globalCleanups.push(fn);
    }

    var onDocumentClick = function() {
      if (isOpen) setCardIsOpen(false);
    };
    document.addEventListener('click', onDocumentClick);
    registerGlobalCleanup(function() { document.removeEventListener('click', onDocumentClick); });

    var onKeyDown = function(e) {
      if (e.key === 'Escape' && isOpen) setCardIsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    registerGlobalCleanup(function() { document.removeEventListener('keydown', onKeyDown); });

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

    // —— 销毁入口 ——
    // 把本实例注册的所有全局副作用登记好，重新挂载或插件卸载时一次性清干净。
    var destroySelf = function() {
      try {
        if (pollingTimer) { clearTimeout(pollingTimer); pollingTimer = null; }
        if (turnPollTimer) { clearTimeout(turnPollTimer); turnPollTimer = null; }
        for (var i = 0; i < globalCleanups.length; i++) {
          try { globalCleanups[i](); } catch (e) {}
        }
        globalCleanups.length = 0;
        if (draggable && typeof draggable.destroy === 'function') draggable.destroy();
        if (window.__yuyuApplyPreferences === applyPreferences) delete window.__yuyuApplyPreferences;
        if (window.__yuyuRenderTurnReport === renderTurnReport) delete window.__yuyuRenderTurnReport;
        if (window.__yuyuRenderCredential === renderCredential) delete window.__yuyuRenderCredential;
        if (window.__yuyuUpdateUIForPerf === updateUI) delete window.__yuyuUpdateUIForPerf;
        if (window.__yuyuWidgetDestroy === destroySelf) window.__yuyuWidgetDestroy = null;
        var node = document.getElementById('yuyu-quota-floating-container');
        if (node && node.parentNode) node.parentNode.removeChild(node);
      } catch (e) {}
    };
    window.__yuyuWidgetDestroy = destroySelf;
  }

  // 模块工厂函数
  function factory(require) {
    var react = null;
    try { react = require('react'); } catch(e) { react = window.React; }

    /**
     * 幂等挂载：多处入口（React 副作用 / apply 直调 / DOMContentLoaded）
     * 都可能触发，但浮窗只能有一份。
     */
    function ensureMounted() {
      if (typeof document === 'undefined') return;
      if (document.getElementById('yuyu-quota-floating-container')) return;
      mountDOMWidget();
    }

    function YuyuReactComponent() {
      if (!react) return null;
      react.useEffect(function() {
        ensureMounted();
        // 组件卸载时同步销毁浮窗，避免残留监听器与轮询
        return function() {
          if (typeof window.__yuyuWidgetDestroy === 'function') {
            try { window.__yuyuWidgetDestroy(); } catch (e) {}
          }
        };
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

      // 实时检测暗色模式
      var isDark = false;
      try {
        var t = snap.currentTheme || (snap.preferences && snap.preferences.theme) || 'system';
        if (t === 'dark') isDark = true;
        else if (t === 'light') isDark = false;
        else {
          isDark = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ||
                   (typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.body.classList.contains('dark')));
        }
      } catch(e) {}

      react.useEffect(function() {
        var handler = function(newStore) {
          setSnap(Object.assign({}, newStore));
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

      function handleTopup() {
        setStatusMsg('正在打开鱼鱼 API 充值页面...');
        requestBackend('/open-topup', { method: 'POST' }).catch(function() {
          window.open('https://sub.anzhiyu.com/recharge-center', '_blank');
        });
      }


      // ---- 与挂件共用一套设计语言：纸面底色、发丝分隔线、余额是唯一的主角 ----
      var P = isDark ? {
        paper: '#1b2027',
        ink: '#eef1f5',
        ink2: '#c2cad4',
        muted: '#9aa4b1',
        faint: '#8d97a4',
        hair: 'rgba(255,255,255,0.11)',
        hairSoft: 'rgba(255,255,255,0.06)',
        chip: 'rgba(255,255,255,0.07)',
        seg: 'rgba(255,255,255,0.07)',
        segOn: '#2b333d',
        field: '#232a33',
        accent: '#4bbd9b',
        ok: '#4bbd9b',
        warn: '#f0b357'
      } : {
        paper: '#fcfcfb',
        ink: '#16181c',
        ink2: '#4a4f57',
        muted: '#5f656d',
        faint: '#6a7078',
        hair: 'rgba(22,24,28,0.09)',
        hairSoft: 'rgba(22,24,28,0.055)',
        chip: 'rgba(22,24,28,0.045)',
        seg: 'rgba(22,24,28,0.055)',
        segOn: '#ffffff',
        field: '#ffffff',
        accent: '#1d6f5b',
        ok: '#1d6f5b',
        warn: '#b45309'
      };

      function smallBtn(key, text, onClick, primary) {
        return react.createElement('button', {
          key: key,
          type: 'button',
          onClick: onClick,
          style: {
            fontFamily: 'inherit',
            fontSize: '12px',
            fontWeight: 600,
            color: primary ? P.paper : P.ink2,
            background: primary ? P.ink : P.field,
            border: primary ? 'none' : '1px solid ' + P.hair,
            borderRadius: '8px',
            padding: '5px 12px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }
        }, text);
      }

      var accounts = snap.accounts || [];
      var activeEmail = snap.activeEmail || snap.email || '';

      return react.createElement('div', {
        style: {
          padding: '22px 24px 26px',
          maxWidth: '660px',
          fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
          color: P.ink,
          fontVariantNumeric: 'tabular-nums'
        }
      }, [
        // ---- 页眉：账号 + 连接状态 + 两个动作 ----
        react.createElement('div', {
          key: 'head',
          style: { display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '18px' }
        }, [
          react.createElement('span', {
            key: 'mail',
            style: { fontSize: '13px', fontWeight: 600, color: P.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
          }, activeEmail || '未登录'),
          react.createElement('span', {
            key: 'st',
            style: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: P.muted, whiteSpace: 'nowrap' }
          }, [
            react.createElement('i', {
              key: 'd',
              style: {
                width: '5px', height: '5px', borderRadius: '50%',
                background: snap.online ? P.ok : P.warn,
                boxShadow: '0 0 0 3px ' + (snap.online ? 'rgba(29,111,91,0.12)' : 'rgba(180,83,9,0.12)')
              }
            }),
            snap.online ? (snap.lastSync || '已连接') : '离线 · 数据显示 ' + (snap.lastSync || '—')
          ]),
          react.createElement('span', { key: 'sp', style: { flex: 1 } }),
          smallBtn('sync', '从浏览器同步', handleSyncBrowser, false),
          smallBtn('topup', '充值', handleTopup, true)
        ]),

        // ---- 余额：整个页面唯一的大字号 ----
        react.createElement('div', { key: 'hero', style: { paddingBottom: '16px' } }, [
          react.createElement('div', {
            key: 'label',
            style: { fontSize: '11px', letterSpacing: '0.12em', color: P.muted, fontWeight: 500 }
          }, '可用余额'),
          react.createElement('div', {
            key: 'amount',
            style: {
              display: 'flex', alignItems: 'baseline',
              fontSize: '46px', lineHeight: 1.02, fontWeight: 640,
              letterSpacing: '-2.2px', marginTop: '4px', color: P.ink
            }
          }, [
            react.createElement('span', {
              key: 'cur',
              style: { fontSize: '22px', fontWeight: 560, letterSpacing: '-0.3px', color: P.ink2, marginRight: '2px' }
            }, '$'),
            react.createElement('span', { key: 'int' }, Math.floor(Number(snap.balance) || 0).toString()),
            react.createElement('span', {
              key: 'dec',
              style: { color: P.faint }
            }, (Number(snap.balance) || 0).toFixed(2).replace(/^\d+/, ''))
          ]),
          react.createElement('div', {
            key: 'sub',
            style: { fontSize: '12px', color: P.muted, marginTop: '7px' }
          }, '累计充值 $' + Number(snap.totalRecharged || 0).toFixed(2))
        ]),

        // ---- 今日：三列纯文本，不套卡片 ----
        react.createElement('div', {
          key: 'stats',
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            padding: '13px 0',
            borderTop: '1px solid ' + P.hair,
            borderBottom: '1px solid ' + P.hair
          }
        }, [
          react.createElement('div', { key: 's1' }, [
            react.createElement('div', { key: 'k', style: { fontSize: '11.5px', color: P.muted } }, '今日实扣'),
            react.createElement('div', {
              key: 'v',
              style: { fontSize: '17px', fontWeight: 700, color: P.ink, marginTop: '2px', letterSpacing: '-0.3px' }
            }, '$' + Number(snap.todayCost || 0).toFixed(4))
          ]),
          react.createElement('div', { key: 's2' }, [
            react.createElement('div', { key: 'k', style: { fontSize: '11.5px', color: P.muted } }, '今日 Tokens'),
            react.createElement('div', {
              key: 'v',
              style: { fontSize: '17px', fontWeight: 700, color: P.ink, marginTop: '2px', letterSpacing: '-0.3px' }
            }, formatTokens(snap.todayTokens || 0))
          ]),
          react.createElement('div', { key: 's3' }, [
            react.createElement('div', { key: 'k', style: { fontSize: '11.5px', color: P.muted } }, '密钥'),
            react.createElement('div', {
              key: 'v',
              style: { fontSize: '17px', fontWeight: 700, color: P.ink, marginTop: '2px', letterSpacing: '-0.3px' }
            }, (snap.keysCount || 0) + ' 个')
          ])
        ]),

        // ---- 账号列表：整行可点，当前账号用一条左侧竖线标记 ----
        react.createElement('div', { key: 'acc-wrap', style: { paddingTop: '14px' } }, [
          react.createElement('div', {
            key: 'acc-label',
            style: { fontSize: '11px', letterSpacing: '0.12em', color: P.muted, fontWeight: 500, marginBottom: '2px' }
          }, '账号'),
          accounts.length === 0 ? react.createElement('div', {
            key: 'empty',
            style: { fontSize: '12.5px', color: P.faint, padding: '10px 0' }
          }, '还没有账号，点上方「从浏览器同步」读取本地登录状态。') : null,
          accounts.map(function (acc, idx) {
            var isActive = acc.email === activeEmail;
            var bal = typeof acc.balance === 'number' ? acc.balance : (acc.snapshot ? acc.snapshot.balance : 0);
            return react.createElement('button', {
              key: 'acc-' + idx,
              type: 'button',
              title: isActive ? acc.email + '（当前）' : '切换到 ' + acc.email,
              onClick: function () {
                if (isActive) return;
                setStatusMsg('正在切换到 ' + acc.email + '...');
                fetchRemoteBalance(function (d, _e, msg) {
                  setStatusMsg(msg || ('已切换至 ' + d.email));
                }, { action: 'switch', email: acc.email });
              },
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                minHeight: '38px',
                padding: '0 0',
                border: 'none',
                borderTop: '1px solid ' + P.hairSoft,
                background: 'transparent',
                fontFamily: 'inherit',
                cursor: isActive ? 'default' : 'pointer',
                textAlign: 'left'
              }
            }, [
              react.createElement('span', {
                key: 'mark',
                style: {
                  width: '2px',
                  height: '14px',
                  borderRadius: '1px',
                  background: isActive ? P.accent : 'transparent',
                  flexShrink: 0
                }
              }),
              react.createElement('span', {
                key: 'mail',
                style: {
                  fontSize: '12.5px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? P.ink : P.ink2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }
              }, acc.email),
              react.createElement('span', { key: 'sp', style: { flex: 1 } }),
              react.createElement('span', {
                key: 'bal',
                style: {
                  fontSize: '12.5px',
                  fontWeight: 620,
                  color: isActive ? P.ink : P.muted,
                  whiteSpace: 'nowrap'
                }
              }, '$' + Number(bal || 0).toFixed(2))
            ]);
          })
        ]),

        // ---- 手动添加 Token ----
        react.createElement('div', {
          key: 'add',
          style: { display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid ' + P.hair }
        }, [
          react.createElement('input', {
            key: 'input',
            type: 'password',
            value: tokenDraft,
            placeholder: '粘贴 token 手动添加账号',
            onChange: function (e) { setTokenDraft(e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter') handleAddManualToken(); },
            style: {
              flex: 1,
              minWidth: 0,
              fontFamily: 'inherit',
              fontSize: '12.5px',
              color: P.ink,
              background: P.field,
              border: '1px solid ' + P.hair,
              borderRadius: '8px',
              padding: '7px 11px',
              outline: 'none'
            }
          }),
          smallBtn('add-btn', '添加账号', handleAddManualToken, false)
        ]),

        statusMsg ? react.createElement('div', {
          key: 'status',
          style: { fontSize: '12px', color: P.ok, marginTop: '10px', fontWeight: 500 }
        }, statusMsg) : null
      ]);
    }

    function apply(ctx) {
      if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', ensureMounted);
        } else {
          ensureMounted();
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
    // 仅供测试 harness 渲染 React 设置页；生产环境不读取
    mod.exports.__settingsSection = YuyuSettingsSection;
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
