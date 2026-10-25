// DeepSeek Harness Client Extension for 鱼鱼API
// 规范：Oil UI 0.25.0 + 纯原生矢量 SVG (零 Emoji) + DSH React Slots + DOM 防御自挂载
(function() {
  var PLUGIN_ID = 'dsh-plugin-yuyu-quota';
  var STORAGE_KEY = 'dsh_yuyu_auth_token';

  var SVG_WALLET = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V7H4a2 2 0 0 1 0-4h16v4"/><path d="M2 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M17 12a2 2 0 0 0 0 4h4v-4Z"/></svg>';
  var SVG_FISH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.46-3.44 6-7 6s-7.56-2.54-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .5 6.5-1.5 1.5-1.5 5-.5 6.5 2.85-.47 4.27-2.5 4.27-5.17v-2.66Z"/></svg>';
  var SVG_REFRESH = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>';
  var SVG_BROWSER = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M2 8h20"/><circle cx="6" cy="6" r=".5" fill="currentColor"/></svg>';
  var SVG_ALERT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  var SVG_CHECK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  var DEFAULT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNjYsImVtYWlsIjoiMzIzMTY0MDAxOEBxcS5jb20iLCJyb2xlIjoidXNlciIsInRva2VuX3ZlcnNpb24iOjQ1MTQyNTM0MTY1MTE2OTQ3NDksInNpZCI6IjI0ODBiOGI1ZDlmYTViNGM4ZjcxNWY3OGUzNWQyNGM1IiwiYm5kIjoiOTA5M2RjZTY5MWEyZDM3NWMyOGQ3YTkzYmM0OGY0MWMiLCJleHAiOjE3OTMwMTU2OTcsIm5iZiI6MTc5MjkyOTI5NywiaWF0IjoxNzkyOTI5Mjk3fQ.gYsAwsesjvikhSoN4g3-nuaprChXm1zYC3ZHbak1x0k';

  function getSavedToken() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && saved.trim()) return saved.trim();
    } catch(e) {}
    return DEFAULT_TOKEN;
  }

  var tokenStore = {
    token: getSavedToken(),
    email: '3231640018@qq.com',
    balance: 8.80628301,
    totalRecharged: 48.00,
    todayCost: 0.0038398176,
    todayRawCost: 0.06399696,
    todayTokens: 32444,
    keysCount: 4,
    todayRequests: 4,
    totalRequests: 2391,
    totalActualCost: 3.3544474473,
    alertThreshold: 2.0,
    lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };

  var listeners = [];
  function notifyListeners() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](Object.assign({}, tokenStore)); } catch(e) {}
    }
  }

  // 全局实时查询接口（并发拉取 profile 与 usage/dashboard/stats）
  function fetchRemoteBalance(callback) {
    var currentToken = tokenStore.token;
    if (!currentToken) {
      if (callback) callback(null, new Error('未设置 Auth Token'));
      return;
    }

    var headers = {
      'Authorization': 'Bearer ' + currentToken,
      'Accept': 'application/json'
    };

    Promise.all([
      fetch('https://sub.anzhiyu.com/api/v1/user/profile', { method: 'GET', headers: headers }).then(function(r) { return r.json(); }),
      fetch('https://sub.anzhiyu.com/api/v1/usage/dashboard/stats', { method: 'GET', headers: headers }).then(function(r) { return r.json(); }).catch(function() { return null; })
    ])
    .then(function(results) {
      var profileRes = results[0];
      var statsRes = results[1];

      // 鱼鱼API 标准返回格式：{ code: 0, message: "success", data: { ... } }
      var pData = (profileRes && profileRes.code === 0 && profileRes.data) ? profileRes.data : (profileRes && profileRes.data ? profileRes.data : null);
      if (!pData || pData.balance === undefined) {
        throw new Error((profileRes && profileRes.message) || '凭证已过期或返回格式异常');
      }

      tokenStore.balance = parseFloat(pData.balance || 0);
      tokenStore.email = pData.email || tokenStore.email;
      tokenStore.totalRecharged = parseFloat(pData.total_recharged || 0);

      var sData = (statsRes && statsRes.code === 0 && statsRes.data) ? statsRes.data : (statsRes && statsRes.data ? statsRes.data : null);
      if (sData) {
        tokenStore.todayCost = parseFloat(sData.today_actual_cost !== undefined ? sData.today_actual_cost : (sData.today_cost || 0));
        tokenStore.todayRawCost = parseFloat(sData.today_cost || 0);
        tokenStore.todayTokens = parseInt(sData.today_tokens || 0, 10);
        tokenStore.todayRequests = parseInt(sData.today_requests || 0, 10);
        tokenStore.keysCount = parseInt(sData.active_api_keys || sData.total_api_keys || tokenStore.keysCount, 10);
        tokenStore.totalRequests = parseInt(sData.total_requests || 0, 10);
        tokenStore.totalActualCost = parseFloat(sData.total_actual_cost || 0);
      }

      tokenStore.lastSync = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      updateUI();
      notifyListeners();
      if (callback) callback(tokenStore, null);
    })
    .catch(function(err) {
      if (callback) callback(null, err);
    });
  }

  // 刷新 DOM 显示
  function updateUI() {
    var isLow = tokenStore.balance <= tokenStore.alertThreshold;
    var pillVal = document.getElementById('yuyu-pill-val');
    var cardBal = document.getElementById('yuyu-card-bal');
    var cardTime = document.getElementById('yuyu-sync-time');
    var cardEmail = document.getElementById('yuyu-card-email');
    var cardCost = document.getElementById('yuyu-card-cost');
    var cardTokens = document.getElementById('yuyu-card-tokens');
    var cardKeys = document.getElementById('yuyu-card-keys');
    var cardReqs = document.getElementById('yuyu-card-reqs');
    var card30d = document.getElementById('yuyu-card-30d');

    if (pillVal) {
      pillVal.textContent = '$' + tokenStore.balance.toFixed(2);
      pillVal.style.color = isLow ? '#e11d48' : '#059669';
    }
    if (cardBal) cardBal.textContent = tokenStore.balance.toFixed(2);
    if (cardTime) cardTime.textContent = '同步: ' + tokenStore.lastSync;
    if (cardEmail) cardEmail.textContent = tokenStore.email;
    if (cardCost) cardCost.textContent = '$' + tokenStore.todayCost.toFixed(4);
    if (cardTokens) cardTokens.textContent = tokenStore.todayTokens.toLocaleString();
    if (cardKeys) cardKeys.textContent = tokenStore.keysCount + ' 个';
    if (cardReqs) cardReqs.textContent = tokenStore.todayRequests + ' 次';
    if (card30d) card30d.textContent = '近30天: ' + tokenStore.totalRequests.toLocaleString() + ' 次调用 · 实扣 $' + tokenStore.totalActualCost.toFixed(4);
  }

  // DOM 悬浮胶囊注入
  function mountDOMWidget() {
    if (document.getElementById('yuyu-quota-floating-container')) {
      updateUI();
      return;
    }

    var container = document.createElement('div');
    container.id = 'yuyu-quota-floating-container';
    container.style.cssText = 'position:fixed;bottom:20px;right:28px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;font-size:12px;user-select:none;pointer-events:auto;';

    var html = [
      '<div id="yuyu-pill-btn" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:9999px;background:#ffffff;color:#1e293b;border:1px solid #e2e8f0;box-shadow:0 2px 10px rgba(0,0,0,0.08);cursor:pointer;transition:transform 0.15s ease, box-shadow 0.15s ease;">',
      '  <span style="display:inline-flex;color:#475569;">' + SVG_WALLET + '</span>',
      '  <span style="font-weight:600;font-size:11px;color:#475569;letter-spacing:0.2px;">鱼鱼</span>',
      '  <span id="yuyu-pill-val" style="color:#059669;font-weight:700;font-variant-numeric:tabular-nums;font-size:12.5px;">$' + tokenStore.balance.toFixed(2) + '</span>',
      '</div>',
      '<div id="yuyu-card-popup" style="display:none;position:absolute;bottom:42px;right:0;width:310px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 16px 36px -4px rgba(0,0,0,0.14),0 4px 12px -2px rgba(0,0,0,0.05);padding:16px 18px;color:#0f172a;box-sizing:border-box;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
      '    <div style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;">',
      '      <span style="display:inline-flex;color:#2563eb;">' + SVG_FISH + '</span>',
      '      <span>鱼鱼API 资产概况</span>',
      '    </div>',
      '    <button id="yuyu-card-refresh" style="background:none;border:none;cursor:pointer;padding:4px;color:#64748b;display:inline-flex;border-radius:4px;transition:background 0.15s;" title="立即刷新">' + SVG_REFRESH + '</button>',
      '  </div>',
      '  <div style="margin-bottom:12px;padding:12px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#166534;">',
      '      <span style="font-weight:500;">可用总余额</span>',
      '      <span id="yuyu-card-email" style="color:#64748b;font-size:10.5px;max-width:155px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>',
      '    </div>',
      '    <div style="margin-top:4px;display:flex;align-items:baseline;gap:2px;">',
      '      <span style="font-size:15px;font-weight:600;color:#15803d;">$</span>',
      '      <span id="yuyu-card-bal" style="font-size:26px;font-weight:700;color:#15803d;font-variant-numeric:tabular-nums;line-height:1;">' + tokenStore.balance.toFixed(2) + '</span>',
      '    </div>',
      '    <div id="yuyu-card-30d" style="margin-top:6px;font-size:10px;color:#15803d;opacity:0.85;font-variant-numeric:tabular-nums;">近30天: ' + tokenStore.totalRequests.toLocaleString() + ' 次调用 · 实扣 $' + tokenStore.totalActualCost.toFixed(4) + '</div>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:12px;">',
      '    <div style="background:#f8fafc;padding:7px 10px;border-radius:6px;border:1px solid #f1f5f9;">',
      '      <div style="color:#64748b;font-size:10px;">今日余额消耗</div>',
      '      <div id="yuyu-card-cost" style="font-weight:600;font-size:12px;color:#1e293b;margin-top:2px;font-variant-numeric:tabular-nums;">$' + tokenStore.todayCost.toFixed(4) + '</div>',
      '    </div>',
      '    <div style="background:#f8fafc;padding:7px 10px;border-radius:6px;border:1px solid #f1f5f9;">',
      '      <div style="color:#64748b;font-size:10px;">今日消耗 Tokens</div>',
      '      <div id="yuyu-card-tokens" style="font-weight:600;font-size:12px;color:#1e293b;margin-top:2px;font-variant-numeric:tabular-nums;">' + tokenStore.todayTokens.toLocaleString() + '</div>',
      '    </div>',
      '    <div style="background:#f8fafc;padding:7px 10px;border-radius:6px;border:1px solid #f1f5f9;">',
      '      <div style="color:#64748b;font-size:10px;">名下可用密钥</div>',
      '      <div id="yuyu-card-keys" style="font-weight:600;font-size:12px;color:#1e293b;margin-top:2px;font-variant-numeric:tabular-nums;">' + tokenStore.keysCount + ' 个</div>',
      '    </div>',
      '    <div style="background:#f8fafc;padding:7px 10px;border-radius:6px;border:1px solid #f1f5f9;">',
      '      <div style="color:#64748b;font-size:10px;">今日调用次数</div>',
      '      <div id="yuyu-card-reqs" style="font-weight:600;font-size:12px;color:#1e293b;margin-top:2px;font-variant-numeric:tabular-nums;">' + tokenStore.todayRequests + ' 次</div>',
      '    </div>',
      '  </div>',
      '  <button id="yuyu-card-sync" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 0;background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:500;color:#334155;transition:all 0.15s ease;">',
      '    <span style="display:inline-flex;">' + SVG_BROWSER + '</span>',
      '    <span id="yuyu-sync-label">一键同步最新实时数据</span>',
      '  </button>',
      '  <div id="yuyu-sync-tip" style="display:none;font-size:10.5px;text-align:center;margin-top:6px;padding:4px 6px;border-radius:4px;background:#f0fdf4;color:#059669;"></div>',
      '  <div style="margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#94a3b8;">',
      '    <span id="yuyu-sync-time">同步: ' + tokenStore.lastSync + '</span>',
      '    <span style="color:#10b981;font-weight:500;">● 国内网络直连</span>',
      '  </div>',
      '</div>'
    ].join('\n');

    container.innerHTML = html;
    document.body.appendChild(container);

    var emailEl = container.querySelector('#yuyu-card-email');
    if (emailEl) emailEl.textContent = tokenStore.email;

    var pill = container.querySelector('#yuyu-pill-btn');
    var card = container.querySelector('#yuyu-card-popup');
    var syncBtn = container.querySelector('#yuyu-card-sync');
    var refreshBtn = container.querySelector('#yuyu-card-refresh');
    var tip = container.querySelector('#yuyu-sync-tip');
    var syncLabel = container.querySelector('#yuyu-sync-label');

    pill.addEventListener('mouseenter', function() {
      pill.style.transform = 'translateY(-1px)';
      pill.style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)';
    });
    pill.addEventListener('mouseleave', function() {
      pill.style.transform = 'none';
      pill.style.boxShadow = '0 2px 10px rgba(0,0,0,0.08)';
    });

    var isOpen = false;
    pill.addEventListener('click', function(e) {
      e.stopPropagation();
      isOpen = !isOpen;
      card.style.display = isOpen ? 'block' : 'none';
      if (isOpen) {
        fetchRemoteBalance();
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
      fetchRemoteBalance(function(data, err) {
        tip.style.display = 'block';
        if (data) {
          tip.style.color = '#059669';
          tip.style.background = '#f0fdf4';
          tip.textContent = '实时数据已同步 ($' + data.balance.toFixed(2) + ')';
        } else {
          tip.style.color = '#b91c1c';
          tip.style.background = '#fef2f2';
          tip.textContent = (err && err.message) || '刷新失败，请检查网络或 Token';
        }
        setTimeout(function() { tip.style.display = 'none'; }, 2500);
      });
    });

    // 同步按钮
    syncBtn.addEventListener('click', function() {
      syncLabel.textContent = '正在同步最新鱼鱼API数据...';
      syncBtn.disabled = true;
      fetchRemoteBalance(function(data, err) {
        syncBtn.disabled = false;
        syncLabel.textContent = '一键同步最新实时数据';
        tip.style.display = 'block';
        if (data) {
          tip.style.color = '#059669';
          tip.style.background = '#f0fdf4';
          tip.textContent = '同步成功: ' + data.email + ' | 余额 $' + data.balance.toFixed(2);
        } else {
          tip.style.color = '#b91c1c';
          tip.style.background = '#fef2f2';
          tip.textContent = (err && err.message) || '同步失败，请在设置中更新 Token';
        }
        setTimeout(function() { tip.style.display = 'none'; }, 3500);
      });
    });

    // 挂载后立即拉取一次最新数据，并启动 3 分钟自动轮询
    fetchRemoteBalance();
    if (window.__yuyuQuotaTimer) {
      clearInterval(window.__yuyuQuotaTimer);
    }
    window.__yuyuQuotaTimer = setInterval(function() {
      fetchRemoteBalance();
    }, 3 * 60 * 1000);
  }

  // 模块工厂函数
  function factory(require) {
    var react = null;
    try { react = require('react'); } catch(e) { react = window.React; }

    // React 封装组件 (用于 Shell Overlay)
    function YuyuReactComponent() {
      if (!react) return null;
      react.useEffect(function() {
        mountDOMWidget();
      }, []);
      return react.createElement('div', { id: 'yuyu-quota-mount-point' });
    }

    // 设置面板组件 (与 tokenStore 实时联动，支持查看完整指标与自定义 Token)
    function YuyuSettingsSection() {
      if (!react) return null;
      var storeState = react.useState(Object.assign({}, tokenStore));
      var snap = storeState[0];
      var setSnap = storeState[1];

      var tokenInputState = react.useState(tokenStore.token);
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
        fetchRemoteBalance();
        return function() {
          var idx = listeners.indexOf(handler);
          if (idx !== -1) listeners.splice(idx, 1);
        };
      }, []);

      function handleSaveAndRefresh() {
        if (tokenDraft && tokenDraft.trim()) {
          tokenStore.token = tokenDraft.trim();
          try { window.localStorage.setItem(STORAGE_KEY, tokenStore.token); } catch(e) {}
        }
        setStatusMsg('正在从 sub.anzhiyu.com 同步实时数据...');
        fetchRemoteBalance(function(data, err) {
          if (data) {
            setStatusMsg('同步成功！最新余额: $' + data.balance.toFixed(2) + ' (' + data.lastSync + ')');
          } else {
            setStatusMsg('同步失败: ' + ((err && err.message) || '请检查 Token 是否有效'));
          }
        });
      }

      return react.createElement('div', {
        style: {
          padding: '24px',
          maxWidth: '600px',
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
            }, '鱼鱼API (sub.anzhiyu.com) 资产监控')
          ]),
          react.createElement('button', {
            key: 'refresh-btn',
            onClick: handleSaveAndRefresh,
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
          }, '立即刷新数据')
        ]),
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
            react.createElement('span', { key: 'l' }, '当前账户可用总余额'),
            react.createElement('span', { key: 'r', style: { color: '#64748b' } }, '账号: ' + snap.email)
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
          }, '网页登录凭证 (Auth Token / JWT):'),
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
              onClick: handleSaveAndRefresh,
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
            }, '保存并同步')
          ])
        ]),
        statusMsg ? react.createElement('div', {
          key: 'status-msg',
          style: { fontSize: '12px', color: '#059669', marginBottom: '10px', fontWeight: 500 }
        }, statusMsg) : null,
        react.createElement('div', {
          key: 'desc',
          style: { fontSize: '12px', color: '#64748b', lineHeight: 1.6 }
        }, '提示：主界面右下角常驻悬浮胶囊与此处数据实时同步（最后同步时间: ' + snap.lastSync + '）。您也可以随时双击桌面插件文件夹内的「一键配置.bat」从 Chrome 自动提取最新凭证。')
      ]);
    }

    function apply(ctx) {
      // 1. 原生 DOM 立即确保挂载
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
          // 2. 注入全局悬浮层插槽
          slots.inject('shell.overlay', function() {
            return slots.register({
              name: 'shell.overlay',
              id: 'yuyu-quota-overlay'
            }, function() {
              return react ? react.createElement(YuyuReactComponent) : null;
            });
          });

          // 3. 注入设置面板独立页签插槽
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

          // 4. 注入插件管理页面的展开配置插槽
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

  // 方式 1: 注册到 DSH 官方 ModuleLoader
  if (typeof window !== 'undefined' && window.__ModuleLoader__ && window.__ModuleLoader__.load) {
    window.__ModuleLoader__.load({
      id: PLUGIN_ID,
      factory: factory
    });
  }

  // 方式 2: 自执行挂载保护
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
