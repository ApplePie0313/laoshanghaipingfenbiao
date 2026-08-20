/* ==========================================================
   老上海评分表 - 主逻辑
   结构：数据层 → 路由层 → 渲染层 → 交互层
   ========================================================== */

(function () {
  'use strict';

  // ============================================================
  //  1. 常量 & 配置
  // ============================================================
  const STORAGE_KEY = 'lao_shanghai_data';

  const CATEGORIES = {
    eat:   { key: 'eat',   name: '吃',   icon: '🍜', cardClass: 'cat-eat'   },
    drink: { key: 'drink', name: '喝',   icon: '☕', cardClass: 'cat-drink' },
    play:  { key: 'play',  name: '玩乐', icon: '🎡', cardClass: 'cat-play'  }
  };

  // ============================================================
  //  2. 数据层：LocalStorage 读写 & 工具方法
  // ============================================================
  const Data = {
    // 读取数据
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return Data._defaultData();
        const data = JSON.parse(raw);
        // 兼容旧格式，确保三大分类都存在
        Object.keys(CATEGORIES).forEach(k => {
          if (!data.categories[k]) data.categories[k] = { shops: [] };
          if (!data.categories[k].shops) data.categories[k].shops = [];
        });
        return data;
      } catch (e) {
        console.error('读取数据失败，使用默认数据', e);
        return Data._defaultData();
      }
    },

    // 保存数据
    save(data) {
      data.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    // 空数据模板
    _defaultData() {
      const now = new Date().toISOString();
      return {
        categories: {
          eat:   { shops: [] },
          drink: { shops: [] },
          play:  { shops: [] }
        },
        createdAt: now,
        updatedAt: now
      };
    },

    // 生成唯一 ID
    genId(prefix) {
      return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    },

    // 计算某店的平均评分
    avgRating(shop) {
      if (!shop.products || shop.products.length === 0) return null;
      const sum = shop.products.reduce((s, p) => s + (Number(p.rating) || 0), 0);
      return Math.round((sum / shop.products.length) * 10) / 10;
    },

    // 产品排序：先按评分降序，再按创建时间降序
    sortProducts(products) {
      return [...products].sort((a, b) => {
        const ra = Number(a.rating) || 0;
        const rb = Number(b.rating) || 0;
        if (rb !== ra) return rb - ra;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    },

    // 查找某分类下的店
    findShop(data, categoryKey, shopId) {
      const cat = data.categories[categoryKey];
      if (!cat) return null;
      return cat.shops.find(s => s.id === shopId) || null;
    },

    // 根据 shopId 反查 categoryKey 和 shop
    locateShop(data, shopId) {
      for (const key of Object.keys(CATEGORIES)) {
        const shop = Data.findShop(data, key, shopId);
        if (shop) return { categoryKey: key, shop };
      }
      return null;
    }
  };

  // ============================================================
  //  3. 应用状态
  // ============================================================
  let appData = Data.load();

  // 弹窗相关临时状态
  const modalState = {
    shop:    { mode: 'create', categoryKey: null, shopId: null },
    product: { mode: 'create', shopId: null, productId: null, currentRating: 0 },
    delete:  { productId: null }
  };

  // ============================================================
  //  4. 视图工具
  // ============================================================
  const Views = {
    home:     document.getElementById('view-home'),
    shops:    document.getElementById('view-shops'),
    products: document.getElementById('view-products')
  };

  function showView(name) {
    Object.keys(Views).forEach(k => {
      Views[k].classList.toggle('hidden', k !== name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ============================================================
  //  5. 星级渲染工具（展示用）
  // ============================================================
  function renderStars(rating) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    let html = '<span class="stars" title="' + r.toFixed(1) + '分">';
    for (let i = 1; i <= 5; i++) {
      if (r >= i) {
        html += '<span class="star on">★</span>';
      } else if (r >= i - 0.5) {
        html += '<span class="star half">★</span>';
      } else {
        html += '<span class="star">★</span>';
      }
    }
    html += '</span>';
    return html;
  }

  // ============================================================
  //  6. 路由层：Hash Router
  // ============================================================
  function parseHash() {
    const h = location.hash || '#/';
    const parts = h.replace(/^#\/?/, '').split('/').filter(Boolean);
    // #/ 或空 → home
    if (parts.length === 0) return { page: 'home' };
    // #/shops/eat → shops / eat
    if (parts[0] === 'shops' && parts[1]) {
      return { page: 'shops', categoryKey: parts[1] };
    }
    // #/products/s_xxx → products / shopId
    if (parts[0] === 'products' && parts[1]) {
      return { page: 'products', shopId: parts[1] };
    }
    return { page: 'home' };
  }

  function handleRoute() {
    const route = parseHash();
    switch (route.page) {
      case 'home':
        renderHome();
        showView('home');
        break;
      case 'shops':
        if (!CATEGORIES[route.categoryKey]) { location.hash = '#/'; return; }
        renderShops(route.categoryKey);
        showView('shops');
        break;
      case 'products':
        const located = Data.locateShop(appData, route.shopId);
        if (!located) { location.hash = '#/'; return; }
        renderProducts(located.categoryKey, located.shop);
        showView('products');
        break;
      default:
        location.hash = '#/';
    }
  }

  window.addEventListener('hashchange', handleRoute);

  // ============================================================
  //  7. 渲染层：三大视图
  // ============================================================

  // ---------- 视图一：大分类首页 ----------
  function renderHome() {
    const grid = document.getElementById('categoryGrid');
    let html = '';
    Object.values(CATEGORIES).forEach(cat => {
      const shops = appData.categories[cat.key].shops || [];
      html += `
        <div class="category-card ${cat.cardClass}" data-cat="${cat.key}">
          <div class="category-icon">${cat.icon}</div>
          <div class="category-name">${cat.name}</div>
          <div class="category-count">共收录 ${shops.length} 家店</div>
        </div>
      `;
    });
    grid.innerHTML = html;

    // 绑定点击事件
    grid.querySelectorAll('.category-card').forEach(el => {
      el.addEventListener('click', () => {
        const cat = el.dataset.cat;
        location.hash = '#/shops/' + cat;
      });
    });
  }

  // ---------- 视图二：店名列表 ----------
  function renderShops(categoryKey) {
    const cat = CATEGORIES[categoryKey];
    document.getElementById('shopsCategoryTitle').textContent = cat.icon + ' ' + cat.name;

    const listEl = document.getElementById('shopList');
    const shops = appData.categories[categoryKey].shops || [];

    if (shops.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-text">还没有收录任何店，快去添加第一家吧～</div>
          <button class="btn-primary" id="emptyAddShop">+ 新建店名</button>
        </div>
      `;
      const btn = document.getElementById('emptyAddShop');
      if (btn) btn.addEventListener('click', () => openShopModal('create', categoryKey));
      return;
    }

    // 店名按最近更新时间倒序
    const sortedShops = [...shops].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    let html = '';
    sortedShops.forEach(shop => {
      const avg = Data.avgRating(shop);
      const count = (shop.products || []).length;
      let ratingHtml;
      if (avg === null) {
        ratingHtml = '<span style="color:#B0A596;">暂无评分</span>';
      } else {
        ratingHtml = renderStars(avg) + ' <span class="rating-num">' + avg.toFixed(1) + '</span>';
      }

      html += `
        <div class="shop-card" data-shop-id="${shop.id}">
          <div class="shop-name">${escapeHtml(shop.name)}</div>
          <div class="shop-edit-btn">
            <button class="btn-icon shop-edit" data-edit="${shop.id}" title="编辑店名">✏️ 编辑</button>
          </div>
          <div class="shop-meta">
            <span>平均评分：${ratingHtml}</span>
            <span>收录产品：${count} 件</span>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;

    // 事件：点卡片 → 进入产品页
    listEl.querySelectorAll('.shop-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.shop-edit')) return; // 编辑按钮不触发跳转
        const shopId = card.dataset.shopId;
        location.hash = '#/products/' + shopId;
      });
    });
    // 事件：编辑店名
    listEl.querySelectorAll('.shop-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openShopModal('edit', categoryKey, btn.dataset.edit);
      });
    });
  }

  // ---------- 视图三：产品列表 ----------
  function renderProducts(categoryKey, shop) {
    const cat = CATEGORIES[categoryKey];

    // 面包屑
    document.getElementById('crumbCategory').textContent = cat.icon + ' ' + cat.name;
    document.getElementById('crumbShop').textContent = shop.name;

    // 店名信息区
    const infoEl = document.getElementById('shopInfo');
    const addrRow = shop.address
      ? `<div class="shop-info-row"><span class="shop-info-label">📍 地址</span><span>${escapeHtml(shop.address)}</span></div>`
      : `<div class="shop-info-row no-data"><span class="shop-info-label">📍 地址</span><span>暂无</span></div>`;
    const notesRow = shop.notes
      ? `<div class="shop-info-row"><span class="shop-info-label">💬 备注</span><span>${escapeHtml(shop.notes)}</span></div>`
      : `<div class="shop-info-row no-data"><span class="shop-info-label">💬 备注</span><span>暂无</span></div>`;
    infoEl.innerHTML = addrRow + notesRow;

    // 产品列表
    const listEl = document.getElementById('productList');
    const products = Data.sortProducts(shop.products || []);

    if (products.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-text">这家店还没有收录产品，来点评第一个吧～</div>
          <button class="btn-primary" id="emptyAddProduct">+ 新建产品</button>
        </div>
      `;
      const btn = document.getElementById('emptyAddProduct');
      if (btn) btn.addEventListener('click', () => openProductModal('create', shop.id));
      return;
    }

    let html = '';
    products.forEach((p, idx) => {
      const rank = idx + 1;
      const rankClass = rank <= 3 ? 'rank-' + rank : '';
      const notesHtml = p.notes
        ? `<div class="product-notes">${escapeHtml(p.notes)}</div>`
        : '';
      html += `
        <div class="product-card ${rankClass}" data-product-id="${p.id}">
          <div class="product-rank">${rank}.</div>
          <div class="product-main">
            <div class="product-title-row">
              <div class="product-name">${escapeHtml(p.name)}</div>
              <div class="product-rating">
                ${renderStars(p.rating)}
                <span class="rating-num">${Number(p.rating).toFixed(1)}</span>
              </div>
            </div>
            ${notesHtml}
          </div>
          <div class="product-actions">
            <button class="btn-icon" data-edit-product="${p.id}" title="编辑">✏️</button>
            <button class="btn-icon delete" data-del-product="${p.id}" title="删除">🗑️</button>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;

    // 事件：编辑产品
    listEl.querySelectorAll('[data-edit-product]').forEach(btn => {
      btn.addEventListener('click', () => {
        openProductModal('edit', shop.id, btn.dataset.editProduct);
      });
    });
    // 事件：删除产品
    listEl.querySelectorAll('[data-del-product]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.delProduct;
        const product = (shop.products || []).find(x => x.id === pid);
        if (!product) return;
        openDeleteModal(pid, product.name);
      });
    });
  }

  // ============================================================
  //  8. 弹窗控制
  // ============================================================
  function openModal(maskId) {
    document.getElementById(maskId).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(maskId) {
    document.getElementById(maskId).classList.add('hidden');
    document.body.style.overflow = '';
  }

  // 点遮罩（非弹窗内容）关闭弹窗
  document.querySelectorAll('.modal-mask').forEach(mask => {
    mask.addEventListener('click', (e) => {
      if (e.target === mask) closeModal(mask.id);
    });
  });
  // 所有 [data-close] 按钮
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-mask:not(.hidden)').forEach(m => {
      closeModal(m.id);
    });
  });

  // ---------- 店名弹窗 ----------
  function openShopModal(mode, categoryKey, shopId) {
    modalState.shop = { mode, categoryKey, shopId };
    const title = document.getElementById('shopModalTitle');
    const nameInput = document.getElementById('shopNameInput');
    const addrInput = document.getElementById('shopAddressInput');
    const notesInput = document.getElementById('shopNotesInput');

    if (mode === 'create') {
      title.textContent = '新建店名';
      nameInput.value = '';
      addrInput.value = '';
      notesInput.value = '';
    } else {
      title.textContent = '编辑店名';
      const shop = Data.findShop(appData, categoryKey, shopId);
      if (!shop) return;
      nameInput.value = shop.name;
      addrInput.value = shop.address || '';
      notesInput.value = shop.notes || '';
    }
    openModal('shopModalMask');
    setTimeout(() => nameInput.focus(), 50);
  }

  function saveShop() {
    const name = document.getElementById('shopNameInput').value.trim();
    const address = document.getElementById('shopAddressInput').value.trim();
    const notes = document.getElementById('shopNotesInput').value.trim();
    if (!name) { alert('请输入店名'); return; }

    const { mode, categoryKey, shopId } = modalState.shop;
    const now = new Date().toISOString();

    if (mode === 'create') {
      const newShop = {
        id: Data.genId('s'),
        name, address, notes,
        products: [],
        createdAt: now,
        updatedAt: now
      };
      appData.categories[categoryKey].shops.push(newShop);
    } else {
      const shop = Data.findShop(appData, categoryKey, shopId);
      if (!shop) return;
      shop.name = name;
      shop.address = address;
      shop.notes = notes;
      shop.updatedAt = now;
    }
    Data.save(appData);
    closeModal('shopModalMask');
    handleRoute(); // 刷新当前视图
  }

  // ---------- 产品弹窗（含星级交互） ----------
  function buildStarRating(container, initialRating, onChange) {
    container.innerHTML = '';
    let current = Math.max(0, Math.min(5, Number(initialRating) || 0));
    const step = 0.5;

    function render() {
      let html = '';
      for (let i = 1; i <= 5; i++) {
        let cls = 'sr-star';
        if (current >= i) cls += ' on';
        else if (current >= i - step) cls += ' half';
        html += `<span class="${cls}" data-val="${i}">★</span>`;
      }
      container.innerHTML = html;

      container.querySelectorAll('.sr-star').forEach(star => {
        const full = Number(star.dataset.val);
        // 点击整星区域（左半=半星，右半=整星）
        star.addEventListener('click', (e) => {
          const rect = star.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const half = rect.width / 2;
          current = x < half ? full - step : full;
          onChange(current);
          render();
        });
        // 鼠标悬停预览
        star.addEventListener('mousemove', (e) => {
          const rect = star.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const half = rect.width / 2;
          const hoverVal = x < half ? full - step : full;
          highlight(container, hoverVal);
        });
        star.addEventListener('mouseleave', () => {
          highlight(container, current);
        });
      });
    }
    function highlight(root, val) {
      root.querySelectorAll('.sr-star').forEach(star => {
        const full = Number(star.dataset.val);
        star.classList.remove('on', 'half');
        if (val >= full) star.classList.add('on');
        else if (val >= full - step) star.classList.add('half');
      });
    }
    render();
    onChange(current);
  }

  function openProductModal(mode, shopId, productId) {
    modalState.product = { mode, shopId, productId, currentRating: 0 };
    const title = document.getElementById('productModalTitle');
    const nameInput = document.getElementById('productNameInput');
    const notesInput = document.getElementById('productNotesInput');
    const ratingEl = document.getElementById('starRating');
    const ratingValueEl = document.getElementById('ratingValue');

    let initRating = 0;
    if (mode === 'create') {
      title.textContent = '新建产品';
      nameInput.value = '';
      notesInput.value = '';
      initRating = 0;
    } else {
      title.textContent = '编辑产品';
      const located = Data.locateShop(appData, shopId);
      if (!located) return;
      const product = (located.shop.products || []).find(p => p.id === productId);
      if (!product) return;
      nameInput.value = product.name;
      notesInput.value = product.notes || '';
      initRating = Number(product.rating) || 0;
    }
    // 构建星级
    buildStarRating(ratingEl, initRating, (val) => {
      modalState.product.currentRating = val;
      ratingValueEl.textContent = val.toFixed(1);
    });
    openModal('productModalMask');
    setTimeout(() => nameInput.focus(), 50);
  }

  function saveProduct() {
    const name = document.getElementById('productNameInput').value.trim();
    const notes = document.getElementById('productNotesInput').value.trim();
    const rating = modalState.product.currentRating;
    if (!name) { alert('请输入产品名'); return; }
    if (rating <= 0) { alert('请给产品打分'); return; }

    const { mode, shopId, productId } = modalState.product;
    const located = Data.locateShop(appData, shopId);
    if (!located) return;
    const now = new Date().toISOString();

    if (mode === 'create') {
      const newProduct = {
        id: Data.genId('p'),
        name,
        rating,
        notes,
        createdAt: now,
        updatedAt: now
      };
      if (!located.shop.products) located.shop.products = [];
      located.shop.products.push(newProduct);
    } else {
      const product = (located.shop.products || []).find(p => p.id === productId);
      if (!product) return;
      product.name = name;
      product.rating = rating;
      product.notes = notes;
      product.updatedAt = now;
    }
    located.shop.updatedAt = now;
    Data.save(appData);
    closeModal('productModalMask');
    handleRoute();
  }

  // ---------- 删除确认弹窗 ----------
  function openDeleteModal(productId, productName) {
    modalState.delete.productId = productId;
    document.getElementById('deleteProductName').textContent = productName;
    openModal('deleteModalMask');
  }

  function confirmDelete() {
    const pid = modalState.delete.productId;
    if (!pid) return;
    // 在当前产品页所在的 shop 中删除
    const route = parseHash();
    if (route.page !== 'products') return;
    const located = Data.locateShop(appData, route.shopId);
    if (!located) return;
    located.shop.products = (located.shop.products || []).filter(p => p.id !== pid);
    located.shop.updatedAt = new Date().toISOString();
    Data.save(appData);
    closeModal('deleteModalMask');
    handleRoute();
  }

  // ============================================================
  //  9. 顶部按钮 & 全局事件绑定
  // ============================================================
  function bindGlobalEvents() {
    // 首页返回按钮其实不需要，但保留结构一致性
    document.getElementById('btnBackHome').addEventListener('click', () => {
      location.hash = '#/';
    });
    document.getElementById('btnBackShops').addEventListener('click', () => {
      // 回到当前店的分类页面
      const route = parseHash();
      if (route.page === 'products') {
        const located = Data.locateShop(appData, route.shopId);
        if (located) {
          location.hash = '#/shops/' + located.categoryKey;
          return;
        }
      }
      location.hash = '#/';
    });

    // 店名列表：新建
    document.getElementById('btnAddShop').addEventListener('click', () => {
      const route = parseHash();
      if (route.page === 'shops') {
        openShopModal('create', route.categoryKey);
      }
    });

    // 产品列表：新建
    document.getElementById('btnAddProduct').addEventListener('click', () => {
      const route = parseHash();
      if (route.page === 'products') {
        openProductModal('create', route.shopId);
      }
    });

    // 保存按钮
    document.getElementById('btnSaveShop').addEventListener('click', saveShop);
    document.getElementById('btnSaveProduct').addEventListener('click', saveProduct);
    document.getElementById('btnConfirmDelete').addEventListener('click', confirmDelete);

    // 弹窗表单里按 Enter 保存（多行文本除外）
    document.getElementById('shopNameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveShop();
    });
    document.getElementById('productNameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveProduct();
    });

    // ---------- 搜索框 ----------
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    let searchTimer = null;

    function onSearchInput() {
      const kw = searchInput.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => doSearch(kw), 180);
    }

    searchInput.addEventListener('input', onSearchInput);
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      doSearch('');
      searchInput.focus();
    });
  }

  // ============================================================
  //  10. 工具：HTML 转义 + 关键词高亮
  // ============================================================
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 把 text 里的 keyword 用 <mark> 高亮；返回 html 字符串
  function highlight(text, keyword) {
    const safe = escapeHtml(text);
    if (!keyword) return safe;
    // 给正则特殊字符转义
    const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const re = new RegExp(esc, 'ig');
      return safe.replace(re, (m) => '<mark>' + m + '</mark>');
    } catch (e) {
      return safe;
    }
  }

  // ============================================================
  //  11. 搜索：遍历所有分类/店/产品，匹配并渲染
  // ============================================================
  function doSearch(rawKw) {
    const kw = (rawKw || '').trim();
    const resultsEl = document.getElementById('searchResults');
    const gridWrap = document.getElementById('categoryGridWrap');
    const clearBtn = document.getElementById('searchClear');

    clearBtn.classList.toggle('hidden', kw.length === 0);

    if (!kw) {
      resultsEl.classList.add('hidden');
      if (gridWrap) gridWrap.classList.remove('hidden');
      resultsEl.innerHTML = '';
      return;
    }
    if (gridWrap) gridWrap.classList.add('hidden');

    // 搜：店名、店地址、店备注；产品名、产品备注
    const kwLower = kw.toLowerCase();
    const results = [];

    Object.keys(CATEGORIES).forEach((catKey) => {
      const cat = CATEGORIES[catKey];
      const shops = appData.categories[catKey].shops || [];
      shops.forEach((shop) => {
        // 店名匹配
        const inShopName = shop.name && shop.name.toLowerCase().includes(kwLower);
        const inShopAddr = shop.address && shop.address.toLowerCase().includes(kwLower);
        const inShopNotes = shop.notes && shop.notes.toLowerCase().includes(kwLower);
        if (inShopName || inShopAddr || inShopNotes) {
          results.push({
            type: 'shop',
            catKey,
            shopId: shop.id,
            name: shop.name,
            notes: inShopNotes ? shop.notes : (inShopAddr ? ('地址：' + shop.address) : ''),
            rating: Data.avgRating(shop),
            productCount: (shop.products || []).length
          });
        }
        // 产品匹配
        (shop.products || []).forEach((prod) => {
          const inProdName = prod.name && prod.name.toLowerCase().includes(kwLower);
          const inProdNotes = prod.notes && prod.notes.toLowerCase().includes(kwLower);
          if (inProdName || inProdNotes) {
            results.push({
              type: 'product',
              catKey,
              shopId: shop.id,
              shopName: shop.name,
              productId: prod.id,
              name: prod.name,
              rating: Number(prod.rating) || 0,
              notes: inProdNotes ? prod.notes : ''
            });
          }
        });
      });
    });

    // 排序：先店名/产品(无所谓)，然后评分高的在前
    results.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));

    // 渲染
    let html = '';
    html += '<div class="search-results-header">';
    html +=   '<span class="search-results-title">搜索结果</span>';
    html +=   '<span class="search-results-count">共找到 ' + results.length + ' 条</span>';
    html += '</div>';

    if (results.length === 0) {
      html += '<div class="search-empty">';
      html +=   '<div class="empty-icon">🔍</div>';
      html +=   '没有找到匹配「' + escapeHtml(kw) + '」的内容';
      html += '</div>';
    } else {
      results.forEach((r) => {
        const cat = CATEGORIES[r.catKey];
        const pathText = cat.icon + ' ' + cat.name + (r.type === 'product' ? (' / ' + escapeHtml(r.shopName)) : '');
        const ratingHtml = (r.rating != null && !isNaN(r.rating))
          ? (renderStars(r.rating) + ' <span class="rating-num">' + Number(r.rating).toFixed(1) + '</span>')
          : '<span style="color:#B0A596;">暂无评分</span>';
        const extra = r.type === 'shop'
          ? ('收录产品：' + r.productCount + ' 件')
          : '';
        const notesHtml = r.notes
          ? ('<div class="search-item-notes">' + highlight(r.notes, kw) + '</div>')
          : '';

        const targetHash = r.type === 'product'
          ? '#/products/' + r.shopId
          : '#/products/' + r.shopId;   // 店名也跳到该店产品页，少一次点击

        html += '<div class="search-item" data-hash="' + targetHash + '">';
        html +=   '<span class="search-item-type ' + r.type + '">' + (r.type === 'shop' ? '店名' : '产品') + '</span>';
        html +=   '<div class="search-item-name">' + highlight(r.name, kw) + '</div>';
        html +=   '<div class="search-item-path">' + pathText + ' · ' + ratingHtml;
        html +=     (extra ? (' · ' + escapeHtml(extra)) : '');
        html +=   '</div>';
        html +=   notesHtml;
        html += '</div>';
      });
    }
    resultsEl.innerHTML = html;
    resultsEl.classList.remove('hidden');

    // 绑定每条结果的点击跳转
    resultsEl.querySelectorAll('.search-item[data-hash]').forEach((el) => {
      el.addEventListener('click', () => {
        location.hash = el.dataset.hash;
      });
    });
  }

  // ============================================================
  //  12. 启动
  // ============================================================
  function init() {
    bindGlobalEvents();
    handleRoute();
  }

  // DOM 就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
