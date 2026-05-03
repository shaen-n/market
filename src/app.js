let currentUser = null;
let products = [];
let categories = [];
let cart = [];
let editSaleId = null;
let allIncoming = [];
let allSales = [];
let currentProductForPhoto = null;
let salesChart = null;
let availableTabs = [];

// ========== АВТОРИЗАЦИЯ ==========
async function checkAuth() {
  const res = await fetch("/api/me", { credentials: 'include' });
  if (res.ok) {
    currentUser = await res.json();
    const loginContainer = document.getElementById("loginContainer");
    const appContainer = document.getElementById("appContainer");
    if (loginContainer) loginContainer.style.display = "none";
    if (appContainer) appContainer.style.display = "block";
    const userRoleSpan = document.getElementById("userRole");
    if (userRoleSpan) userRoleSpan.innerText = currentUser.role === "admin" ? "Администратор" : "Продавец";
    await loadCategories();
    await initTabs();
    await loadProducts();
    if (currentUser.role === "admin") {
      await loadIncomingHistory();
      await loadDashboard();
    }
    await loadSalesHistory();
    if (currentUser.role === "admin") await loadUsers();
    renderCart();
    initHotkeys();
    initTheme();
  } else {
    const loginContainer = document.getElementById("loginContainer");
    if (loginContainer) loginContainer.style.display = "flex";
  }
}

async function doLogin() {
  const username = document.getElementById("loginUsername").value;
  const password = document.getElementById("loginPassword").value;
  const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: 'include', body: JSON.stringify({ username, password }) });
  if (res.ok) await checkAuth();
  else alert("Неверный логин или пароль");
}

async function doLogout() {
  await fetch("/api/logout", { method: "POST", credentials: 'include' });
  location.reload();
}

// ========== ЗАГРУЗКА КАТЕГОРИЙ ==========
async function loadCategories() {
  const res = await fetch("/api/categories", { credentials: 'include' });
  categories = await res.json();
}

// ========== ВКЛАДКИ ==========
async function initTabs() {
  const isAdmin = currentUser.role === "admin";
  const allTabs = [
    { id: "products", name: "📦 Товары", adminOnly: false },
    { id: "incoming", name: "📥 Приход", adminOnly: true },
    { id: "sales", name: "🧾 Чек-лист", adminOnly: false },
    { id: "history", name: "📅 Продажи", adminOnly: false },
    { id: "dashboard", name: "📊 Дашборд", adminOnly: true },
    { id: "users", name: "👥 Пользователи", adminOnly: true },
    { id: "pickup", name: "🚚 Самовывоз", adminOnly: false },
    { id: "customers", name: "👥 Покупатели", adminOnly: false }
  ];
  availableTabs = allTabs.filter(t => !t.adminOnly || isAdmin);
  const tabsContainer = document.getElementById("tabsContainer");
  const tabContents = document.getElementById("tabContents");
  if (tabsContainer) tabsContainer.innerHTML = "";
  if (tabContents) tabContents.innerHTML = "";
  availableTabs.forEach((tab, idx) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (idx === 0 ? " active" : "");
    btn.textContent = tab.name;
    btn.dataset.tab = tab.id;
    btn.onclick = () => switchTab(tab.id);
    if (tabsContainer) tabsContainer.appendChild(btn);
    const contentDiv = document.createElement("div");
    contentDiv.id = tab.id;
    contentDiv.className = "tab-content" + (idx === 0 ? " active" : "");
    if (tabContents) tabContents.appendChild(contentDiv);
  });

  const productsDiv = document.getElementById("products");
  if (productsDiv) productsDiv.innerHTML = getProductsHtml();
  const incomingDiv = document.getElementById("incoming");
  if (incomingDiv) incomingDiv.innerHTML = getIncomingHtml();
  const salesDiv = document.getElementById("sales");
  if (salesDiv) salesDiv.innerHTML = getSalesHtml();
  const historyDiv = document.getElementById("history");
  if (historyDiv) historyDiv.innerHTML = getHistoryHtml();
  if (isAdmin) {
    const dashboardDiv = document.getElementById("dashboard");
    if (dashboardDiv) dashboardDiv.innerHTML = getDashboardHtml();
    const usersDiv = document.getElementById("users");
    if (usersDiv) usersDiv.innerHTML = getUsersHtml();
  }
  const pickupDiv = document.getElementById("pickup");
  if (pickupDiv) pickupDiv.innerHTML = getPickupHtml();
  const customersDiv = document.getElementById("customers");
  if (customersDiv) customersDiv.innerHTML = getCustomersHtml();

  attachEventHandlers();
  if (!isAdmin) {
    const uploadBtn = document.getElementById("uploadPhotoBtn");
    if (uploadBtn) uploadBtn.style.display = "none";
  }
  initScanner();
}

function getProductsHtml() {
  const isAdmin = currentUser?.role === "admin";
  return `
    ${isAdmin ? `<div class="card"><h3>➕ Новый товар</h3><div class="form-row"><input id="prodName" placeholder="Название"><input id="prodSku" placeholder="Артикул"><input id="prodBarcode" placeholder="Штрихкод"><input id="prodPrice" type="number" placeholder="Цена (₸)"><input id="prodStock" type="number" placeholder="Остаток"><select id="prodCategory"><option value="">-- Категория --</option>${categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select><input type="file" id="prodPhoto" accept="image/*"><div style="display:flex; gap:10px;"><button onclick="addProduct()">➕ Добавить</button><button onclick="openNewCategoryModal()" class="new-category-btn">📁 Новая категория</button></div></div></div>` : ""}
    <div class="card"><h3>📋 Список товаров</h3><div class="category-filter"><select id="categoryFilter"><option value="all">Все категории</option>${categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select><input id="productSearch" placeholder="🔍 Поиск..." class="search-input"><button class="clear-search" onclick="clearProductSearch()">✖</button></div><div id="productsList" class="items-grid"></div></div>
  `;
}
function getIncomingHtml() { return `<div class="card"><h3>📥 Приход товара</h3><div class="form-row"><select id="incomingProductSelect"></select><input id="incomingQty" type="number" placeholder="Количество"><input id="incomingDatetime" type="datetime-local"><input id="incomingComment" placeholder="Комментарий"><button onclick="addIncoming()">📥 Зачислить</button></div></div><div class="card"><h3>📜 История приходов</h3><div class="search-bar"><input id="incomingSearch" placeholder="🔍 Поиск..." class="search-input"><button class="clear-search" onclick="clearIncomingSearch()">✖</button></div><div id="incomingList"></div></div>`; }
function getSalesHtml() { return `<div class="card"><h3>🛒 Оформление чека</h3><div class="form-row"><input id="saleDatetime" type="datetime-local"><button onclick="addCartRow()">➕ Добавить товар</button></div><div class="scanner-row"><input type="text" id="scannerInput" placeholder="📷 Отсканируйте штрихкод, артикул или ID" autocomplete="off"><button onclick="scanAndAdd()">🔍 Найти</button></div><div id="cartItems"></div><div class="total-row">💰 Итого: <span id="cartTotal">0</span> ₸</div><button class="btn-success" onclick="checkout()">💸 Продать</button></div>`; }
function getHistoryHtml() { return `<div class="card"><h3>📅 Фильтр по датам и поиск</h3><div class="form-row"><input id="filterFrom" type="date"><input id="filterTo" type="date"><button onclick="loadSalesHistory()">🔍 Поиск по датам</button><button onclick="resetFilters()">⟳ Сброс</button><button onclick="exportSalesToPDF()" class="btn-success">📄 Экспорт в PDF</button></div><div class="search-bar"><input id="salesSearch" placeholder="🔍 Поиск..." class="search-input"><button class="clear-search" onclick="clearSalesSearch()">✖</button></div></div><div class="card"><h3>📋 Журнал продаж</h3><div id="salesList"></div></div>`; }
function getDashboardHtml() { return `<div class="card"><h3>📊 Статистика склада</h3><div class="dashboard-stats" id="statsCards"></div></div><div class="card"><h3>📈 Продажи за месяц</h3><div class="chart-container"><canvas id="salesChart" width="400" height="200"></canvas></div></div><div class="card"><h3>🏆 Топ-5 продаваемых товаров</h3><div id="topProductsList"></div></div><div class="card warning-card"><h3>⚠️ Уведомления о низком остатке</h3><div id="lowStockList"></div></div>`; }
function getUsersHtml() { return `<div class="card"><h3>👥 Управление пользователями</h3><div class="form-row"><input id="newUsername" placeholder="Логин"><input id="newPassword" type="password" placeholder="Пароль"><select id="newRole"><option value="seller">Продавец</option><option value="admin">Администратор</option></select><button onclick="addUser()">➕ Добавить</button></div><div id="usersList"></div></div>`; }

function getPickupHtml() {
  return `
    <div class="card">
      <h3>📦 Заказы для выдачи</h3>
      <button onclick="refreshPickupOrders()">Обновить список</button>
      <button onclick="showManualTokenInput()" style="margin-left:10px;">📝 Ввести токен вручную</button>
      <div id="pickupOrdersList" style="margin-top:20px;"></div>
    </div>
  `;
}

function getCustomersHtml() {
  return `
    <div class="card">
      <h3>👥 Покупатели и скидки</h3>
      <div id="customersList"></div>
    </div>
  `;
}

function attachEventHandlers() {
  const productSearch = document.getElementById("productSearch");
  if (productSearch) productSearch.addEventListener("input", filterProducts);
  const categoryFilter = document.getElementById("categoryFilter");
  if (categoryFilter) categoryFilter.addEventListener("change", filterProducts);
  const incomingSearch = document.getElementById("incomingSearch");
  if (incomingSearch) incomingSearch.addEventListener("input", filterIncoming);
  const salesSearch = document.getElementById("salesSearch");
  if (salesSearch) salesSearch.addEventListener("input", filterSales);
}

// ========== ФИЛЬТРАЦИЯ ТОВАРОВ ==========
function filterProducts() {
  const searchTerm = document.getElementById("productSearch")?.value.toLowerCase() || "";
  const categoryId = document.getElementById("categoryFilter")?.value;
  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm) || (p.sku && p.sku.toLowerCase().includes(searchTerm));
    const matchCategory = !categoryId || categoryId === "all" || p.category_id == categoryId;
    return matchSearch && matchCategory;
  });
  renderProducts(filtered);
}

function renderProducts(arr) {
  const container = document.getElementById("productsList");
  if (!container) return;
  const isAdmin = currentUser.role === "admin";
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  container.innerHTML = arr.map(p => `
    <div class="product-card">
      <strong>${escapeHtml(p.name)}</strong><br>
      Арт: ${escapeHtml(p.sku)}<br>
      Цена: ${p.price} ₸<br>
      Остаток: ${p.stock}<br>
      Категория: ${catMap[p.category_id] || "Без категории"}<br>
      ${isAdmin ? `<button onclick="openEditProductModal(${p.id})">✏️</button><button onclick="deleteProduct(${p.id})">🗑️</button>` : ""}
      <button onclick="quickAddToCart(${p.id})">➕ в чек</button>
      <button onclick="showProductDetails(${p.id})">👁 Подробнее</button>
    </div>
  `).join("");
}

function clearProductSearch() { const input = document.getElementById("productSearch"); if(input) input.value = ""; filterProducts(); }

// ========== КАТЕГОРИИ ==========
function openNewCategoryModal() {
  if (currentUser.role !== "admin") return;
  document.getElementById("newCategoryName").value = "";
  document.getElementById("newCategoryModal").style.display = "flex";
}
function closeNewCategoryModal() { document.getElementById("newCategoryModal").style.display = "none"; }
async function createNewCategory() {
  const name = document.getElementById("newCategoryName").value.trim();
  if (!name) return alert("Введите название категории");
  const res = await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: 'include', body: JSON.stringify({ name }) });
  if (res.ok) {
    alert("Категория создана");
    closeNewCategoryModal();
    await loadCategories();
    const currentTab = document.querySelector(".tab-content.active")?.id;
    await initTabs();
    if (currentTab) switchTab(currentTab);
    await loadProducts();
  } else {
    alert("Ошибка: возможно, такая категория уже существует");
  }
}

// ========== ТЕМЫ ==========
function initTheme() {
  const savedTheme = localStorage.getItem('app_theme') || 'theme-loft';
  document.body.classList.add(savedTheme);
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.body.classList.contains('theme-loft') ? 'theme-loft' : document.body.classList.contains('theme-dark') ? 'theme-dark' : 'theme-light';
      let next = '';
      if (current === 'theme-loft') next = 'theme-dark';
      else if (current === 'theme-dark') next = 'theme-light';
      else next = 'theme-loft';
      document.body.classList.remove(current);
      document.body.classList.add(next);
      localStorage.setItem('app_theme', next);
    });
  }
}

// ========== ДАШБОРД ==========
async function loadDashboard() {
  if (currentUser.role !== "admin") return;
  const res = await fetch("/api/reports/dashboard", { credentials: 'include' });
  const data = await res.json();
  const statsContainer = document.getElementById("statsCards");
  if (statsContainer) statsContainer.innerHTML = `
    <div class="stat-card"><h3>Товаров</h3><div class="value">${data.products.totalProducts||0}</div></div>
    <div class="stat-card"><h3>Общее кол-во</h3><div class="value">${data.products.totalStock||0} шт.</div></div>
    <div class="stat-card"><h3>Общая стоимость</h3><div class="value">${(data.products.totalValue||0).toFixed(2)} ₸</div></div>
    <div class="stat-card"><h3>Продажи за месяц</h3><div class="value">${(data.monthSales.salesTotal||0).toFixed(2)} ₸</div></div>
    <div class="stat-card"><h3>Кол-во продаж</h3><div class="value">${data.monthSales.salesCount||0}</div></div>
  `;
  const ctx = document.getElementById("salesChart")?.getContext("2d");
  if (ctx && data.dailySales) {
    if (salesChart) salesChart.destroy();
    salesChart = new Chart(ctx, {
      type: "line",
      data: { labels: data.dailySales.map(d=>d.day.slice(8,10)), datasets: [{ label: "Выручка (₸)", data: data.dailySales.map(d=>d.total), borderColor: "#dbb879", backgroundColor: "rgba(219,184,121,0.1)" }] },
      options: { responsive: true, plugins: { legend: { labels: { color: "#e0dcd0" } } }, scales: { y: { ticks: { color: "#e0dcd0" } }, x: { ticks: { color: "#e0dcd0" } } } }
    });
  }
  const topContainer = document.getElementById("topProductsList");
  if (topContainer) topContainer.innerHTML = data.topProducts.map(p=>`<div>${p.name} — продано ${p.sold} шт.</div>`).join("") || "Нет данных";
  const lowContainer = document.getElementById("lowStockList");
  if (lowContainer) lowContainer.innerHTML = data.lowStock.map(p=>`<div>⚠️ ${p.name} — остаток: ${p.stock} шт.</div>`).join("") || "Все товары в достатке";
}

// ========== ПОЛЬЗОВАТЕЛИ (персонал) ==========
async function loadUsers() { if (currentUser.role!=="admin") return; const res = await fetch("/api/users", { credentials: 'include' }); const users = await res.json(); const usersList = document.getElementById("usersList"); if (usersList) usersList.innerHTML = users.map(u=>`<div class="sale-card"><div><strong>${escapeHtml(u.username)}</strong> (${u.role==="admin"?"Админ":"Продавец"})</div><div><button onclick="changeUserPassword(${u.id},'${escapeHtml(u.username)}')">🔑 Сменить пароль</button><button onclick="deleteUser(${u.id})" ${u.id==currentUser.id?"disabled":""}>🗑️</button></div></div>`).join(""); }
async function addUser() { const username=document.getElementById("newUsername").value, password=document.getElementById("newPassword").value, role=document.getElementById("newRole").value; if(!username||!password) return alert("Заполните поля"); const res = await fetch("/api/users",{method:"POST",headers:{"Content-Type":"application/json"},credentials:'include',body:JSON.stringify({username,password,role})}); if(res.ok){ alert("Добавлен"); document.getElementById("newUsername").value=""; document.getElementById("newPassword").value=""; loadUsers(); } else alert("Ошибка"); }
async function changeUserPassword(id,username) { const pwd = prompt(`Новый пароль для ${username}:`); if(!pwd) return; await fetch(`/api/users/${id}/password`,{method:"PUT",headers:{"Content-Type":"application/json"},credentials:'include',body:JSON.stringify({newPassword:pwd})}); alert("Пароль изменён"); }
async function deleteUser(id) { if(!confirm("Удалить?")) return; await fetch(`/api/users/${id}`,{method:"DELETE",credentials:'include'}); loadUsers(); }
// ========== ТОВАРЫ ==========
async function loadProducts() { const res = await fetch("/api/products", { credentials: 'include' }); products = await res.json(); filterProducts(); fillProductSelects(); renderCart(); }
function fillProductSelects() { const sel = document.getElementById("incomingProductSelect"); if(sel) sel.innerHTML = '<option value="">-- Выберите --</option>'+products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} (${p.sku}) — ${p.price} ₸, ост.${p.stock}</option>`).join(""); }
async function addProduct() { if(currentUser.role!=="admin") return; const name=document.getElementById("prodName").value, sku=document.getElementById("prodSku").value, barcode=document.getElementById("prodBarcode").value, price=parseFloat(document.getElementById("prodPrice").value), stock=parseInt(document.getElementById("prodStock").value)||0, category_id=document.getElementById("prodCategory").value, photo=document.getElementById("prodPhoto").files[0]; if(!name||isNaN(price)) return alert("Заполните название и цену"); const fd = new FormData(); fd.append("name",name); fd.append("sku",sku); fd.append("barcode",barcode); fd.append("price",price); fd.append("stock",stock); fd.append("category_id",category_id||""); if(photo) fd.append("photo",photo); await fetch("/api/products",{method:"POST",credentials:'include',body:fd}); ["prodName","prodSku","prodBarcode","prodPrice","prodStock","prodPhoto"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; if(el && el.type==="file") el.value=""; }); const catSelect = document.getElementById("prodCategory"); if(catSelect) catSelect.value=""; await loadProducts(); await loadCategories(); }
async function deleteProduct(id) { if(currentUser.role!=="admin") return; if(!confirm("Удалить товар?")) return; await fetch(`/api/products/${id}`,{method:"DELETE",credentials:'include'}); await loadProducts(); }

let currentEditingProductId = null;
async function openEditProductModal(productId) {
  if (currentUser.role !== "admin") return;
  const product = products.find(p => p.id === productId);
  if (!product) return;
  currentEditingProductId = product.id;
  document.getElementById("editProductId").value = product.id;
  document.getElementById("editProdName").value = product.name;
  document.getElementById("editProdSku").value = product.sku || "";
  document.getElementById("editProdBarcode").value = product.barcode || "";
  document.getElementById("editProdPrice").value = product.price;
  document.getElementById("editProdDescription").value = product.description || "";
  const catSelect = document.getElementById("editProdCategory");
  if (catSelect) {
    catSelect.innerHTML = '<option value="">-- Выберите категорию --</option>' + categories.map(c => `<option value="${c.id}" ${product.category_id == c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join("");
  }
  const img = document.getElementById("editProductPhotoImg");
  if (img) {
    if (product.photo && product.photo !== "null") img.src = product.photo;
    else img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 24 24' fill='none' stroke='%23b87c4f'%3E%3Crect x='2' y='2' width='20' height='20' rx='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5' fill='%23b87c4f'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E";
  }
  document.getElementById("editProductModal").style.display = "flex";
  // привязка кнопки загрузки фото
  const uploadBtn = document.getElementById("uploadEditPhotoBtn");
  if (uploadBtn) {
    const newBtn = uploadBtn.cloneNode(true);
    uploadBtn.parentNode.replaceChild(newBtn, uploadBtn);
    newBtn.addEventListener("click", async () => {
      const fileInput = document.getElementById("editProductPhoto");
      const file = fileInput.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(`/api/products/${currentEditingProductId}/photo`, { method: "PUT", credentials: 'include', body: formData });
      if (res.ok) {
        const data = await res.json();
        const imgElement = document.getElementById("editProductPhotoImg");
        if (imgElement) imgElement.src = data.photo;
        alert("Фото обновлено");
      } else alert("Ошибка загрузки");
    });
  }
}
function closeEditProductModal() { document.getElementById("editProductModal").style.display = "none"; document.getElementById("editProductPhoto").value = ""; }
async function saveProductEdit() {
  if (currentUser.role !== "admin") return;
  const id = currentEditingProductId;
  const name = document.getElementById("editProdName").value;
  const sku = document.getElementById("editProdSku").value;
  const barcode = document.getElementById("editProdBarcode").value;
  const price = parseFloat(document.getElementById("editProdPrice").value);
  const description = document.getElementById("editProdDescription").value;
  const category_id = document.getElementById("editProdCategory").value;
  if (!name || isNaN(price)) { alert("Название и цена обязательны"); return; }
  const res = await fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: 'include', body: JSON.stringify({ name, sku, barcode, price, description, category_id: category_id || null }) });
  if (res.ok) { alert("Товар обновлён"); closeEditProductModal(); await loadProducts(); await loadCategories(); }
  else alert("Ошибка обновления");
}

// ========== DRAWER ==========
function showProductDetails(id) { const p=products.find(p=>p.id===id); if(!p) return; currentProductForPhoto=p; const nameEl = document.getElementById("drawerName"); if(nameEl) nameEl.innerText=p.name; const skuEl = document.getElementById("drawerSku"); if(skuEl) skuEl.innerText=p.sku||"-"; const priceEl = document.getElementById("drawerPrice"); if(priceEl) priceEl.innerText=p.price; const stockEl = document.getElementById("drawerStock"); if(stockEl) stockEl.innerText=p.stock; const descEl = document.getElementById("drawerDescription"); if(descEl) descEl.innerText=p.description||"Нет описания"; const editBtn = document.getElementById("editDescriptionBtn"); if(editBtn) editBtn.style.display = currentUser.role==="admin"?"inline-block":"none"; const drawerImg = document.querySelector("#drawerPhoto img"); if(drawerImg) drawerImg.src = (p.photo&&p.photo!=="null")?p.photo:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 24 24' fill='none' stroke='%23b87c4f'%3E%3Crect x='2' y='2' width='20' height='20' rx='2'%3E%3C/rect%3E%3Ccircle cx='8.5' cy='8.5' r='1.5' fill='%23b87c4f'%3E%3C/circle%3E%3Cpolyline points='21 15 16 10 5 21'%3E%3C/polyline%3E%3C/svg%3E"; const qrDiv=document.getElementById("qrcode"); if(qrDiv){ qrDiv.innerHTML=""; new QRCode(qrDiv,{text:`https://expostroy/tovar/${p.id}`,width:128,height:128}); } const drawer = document.getElementById("productDrawer"); if(drawer) drawer.classList.add("open"); }
function closeDrawer() { const drawer = document.getElementById("productDrawer"); if(drawer) drawer.classList.remove("open"); }
function enableEditDescription() { if(currentUser.role!=="admin") return; const descDiv = document.getElementById("drawerDescription"); if(descDiv) descDiv.style.display="none"; const editArea = document.getElementById("editDescriptionArea"); if(editArea) editArea.style.display="block"; const editBtn = document.getElementById("editDescriptionBtn"); if(editBtn) editBtn.style.display="none"; const descText = document.getElementById("editDescriptionText"); if(descText) descText.value = currentProductForPhoto.description||""; }
function cancelEditDescription() { const descDiv = document.getElementById("drawerDescription"); if(descDiv) descDiv.style.display="block"; const editArea = document.getElementById("editDescriptionArea"); if(editArea) editArea.style.display="none"; if(currentUser.role==="admin"){ const editBtn = document.getElementById("editDescriptionBtn"); if(editBtn) editBtn.style.display="inline-block"; } }
async function saveDescription() { if(currentUser.role!=="admin") return; const newDesc = document.getElementById("editDescriptionText").value; await fetch(`/api/products/${currentProductForPhoto.id}/description`,{method:"PUT",headers:{"Content-Type":"application/json"},credentials:'include',body:JSON.stringify({description:newDesc})}); currentProductForPhoto.description=newDesc; const descDiv = document.getElementById("drawerDescription"); if(descDiv) descDiv.innerText=newDesc||"Нет описания"; cancelEditDescription(); alert("Описание сохранено"); }
async function uploadProductPhoto() { if(currentUser.role!=="admin") return alert("Только администратор"); const input=document.getElementById("photoUploadInput"); input.onchange=async(e)=>{ const file=e.target.files[0]; if(!file) return; const fd=new FormData(); fd.append("photo",file); const res=await fetch(`/api/products/${currentProductForPhoto.id}/photo`,{method:"PUT",credentials:'include',body:fd}); if(res.ok){ const data=await res.json(); currentProductForPhoto.photo=data.photo; const drawerImg=document.querySelector("#drawerPhoto img"); if(drawerImg) drawerImg.src=data.photo; alert("Фото загружено"); } else alert("Ошибка"); }; input.click(); }

// ========== ПРИХОДЫ ==========
async function addIncoming() { if(currentUser.role!=="admin") return; const product_id=document.getElementById("incomingProductSelect").value, quantity=parseInt(document.getElementById("incomingQty").value), datetime=document.getElementById("incomingDatetime").value, comment=document.getElementById("incomingComment").value; if(!product_id||!quantity||quantity<=0) return alert("Выберите товар и количество"); await fetch("/api/incoming",{method:"POST",headers:{"Content-Type":"application/json"},credentials:'include',body:JSON.stringify({product_id,quantity,datetime:datetime||new Date().toISOString().slice(0,16),comment})}); const qtyInput = document.getElementById("incomingQty"); if(qtyInput) qtyInput.value=""; const commentInput = document.getElementById("incomingComment"); if(commentInput) commentInput.value=""; await loadProducts(); await loadIncomingHistory(); }
async function loadIncomingHistory() { if(currentUser.role!=="admin") return; const res=await fetch("/api/incoming",{credentials:'include'}); allIncoming=await res.json(); filterIncoming(); }
function filterIncoming() { const term=document.getElementById("incomingSearch")?.value.toLowerCase()||""; const filtered=allIncoming.filter(inc=>inc.product_name.toLowerCase().includes(term)||(inc.comment&&inc.comment.toLowerCase().includes(term))); const container = document.getElementById("incomingList"); if(container) container.innerHTML=filtered.map(inc=>`<div class="incoming-card"><strong>${escapeHtml(inc.product_name)}</strong> +${inc.quantity} шт.<br>📅 ${new Date(inc.datetime).toLocaleString()}<br>📝 ${escapeHtml(inc.comment||"")}<br><button onclick="editIncoming(${inc.id},${inc.quantity},'${inc.datetime}','${escapeHtml(inc.comment||"")}')">✏️</button><button onclick="deleteIncoming(${inc.id})">🗑️</button></div>`).join(""); }
function clearIncomingSearch() { const inp = document.getElementById("incomingSearch"); if(inp) inp.value=""; filterIncoming(); }
async function editIncoming(id,oldQty,oldDate,oldComment) { if(currentUser.role!=="admin") return; const newQty=prompt("Новое количество:",oldQty); if(!newQty||newQty<=0) return; const newDate=prompt("Новая дата (YYYY-MM-DDTHH:MM):",oldDate.slice(0,16)); const newComment=prompt("Комментарий:",oldComment); await fetch(`/api/incoming/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},credentials:'include',body:JSON.stringify({quantity:parseInt(newQty),datetime:newDate||oldDate,comment:newComment||""})}); await loadProducts(); await loadIncomingHistory(); }
async function deleteIncoming(id) { if(currentUser.role!=="admin") return; if(!confirm("Удалить приход?")) return; await fetch(`/api/incoming/${id}`,{method:"DELETE",credentials:'include'}); await loadProducts(); await loadIncomingHistory(); }

// ========== ЧЕК-ЛИСТ ==========
function quickAddToCart(pid) { const p=products.find(p=>p.id===pid); if(p) cart.push({product_id:p.id,name:p.name,price:p.price,quantity:1}); renderCart(); }
function addCartRow() { cart.push({product_id:null,name:"",price:0,quantity:1}); renderCart(); }
function renderCart() { const container=document.getElementById("cartItems"); if(!container) return; if(!products.length){ container.innerHTML="<div>Загрузка...</div>"; return; } container.innerHTML=""; let total=0; cart.forEach((item,idx)=>{ const prod=products.find(p=>p.id===item.product_id); const price=prod?prod.price:item.price; const qty=item.quantity; const subtotal=price*qty; total+=subtotal; const row=document.createElement("div"); row.className="cart-row"; row.innerHTML=`<select onchange="changeCartProduct(${idx},this.value)"><option value="">-- Товар --</option>${products.map(p=>`<option value="${p.id}" ${item.product_id===p.id?"selected":""}>${escapeHtml(p.name)} (${p.price} ₸, ост.${p.stock})</option>`).join("")}</select><input type="number" value="${qty}" min="1" onchange="changeCartQty(${idx},this.value)"><span>${subtotal.toFixed(2)} ₸</span><button onclick="removeCartItem(${idx})">✖</button>`; container.appendChild(row); }); const totalSpan = document.getElementById("cartTotal"); if(totalSpan) totalSpan.innerText=total.toFixed(2); }
function changeCartProduct(idx,pid) { const p=products.find(p=>p.id==pid); if(p){ cart[idx].product_id=p.id; cart[idx].name=p.name; cart[idx].price=p.price; } else { cart[idx].product_id=null; cart[idx].price=0; } renderCart(); }
function changeCartQty(idx,qty) { cart[idx].quantity=parseInt(qty)||1; renderCart(); }
function removeCartItem(idx) { cart.splice(idx,1); renderCart(); }
async function checkout() { const valid=cart.filter(i=>i.product_id&&i.quantity>0); if(!valid.length) return alert("Нет товаров"); const sale_date=document.getElementById("saleDatetime").value; const items=valid.map(i=>({product_id:i.product_id,quantity:i.quantity,price:i.price})); const res=await fetch("/api/sales",{method:"POST",headers:{"Content-Type":"application/json"},credentials:'include',body:JSON.stringify({items,sale_date:sale_date||new Date().toISOString().slice(0,16)})}); if(res.ok){ cart=[]; renderCart(); await loadProducts(); await loadSalesHistory(); alert("Продажа оформлена"); } else alert("Ошибка"); }

// ========== ИСТОРИЯ ПРОДАЖ ==========
async function loadSalesHistory() { let url="/api/sales"; const from=document.getElementById("filterFrom")?.value, to=document.getElementById("filterTo")?.value; const p=new URLSearchParams(); if(from) p.append("from",from+"T00:00:00"); if(to) p.append("to",to+"T23:59:59"); if(p.toString()) url+="?"+p.toString(); const res=await fetch(url,{credentials:'include'}); allSales=await res.json(); filterSales(); }
function filterSales() { const term=document.getElementById("salesSearch")?.value.toLowerCase()||""; const filtered=allSales.filter(s=>s.id.toString().includes(term)||s.total.toString().includes(term)||new Date(s.created_at).toLocaleString().toLowerCase().includes(term)||(s.seller_name&&s.seller_name.toLowerCase().includes(term))); const container = document.getElementById("salesList"); if(container) container.innerHTML=filtered.map(s=>`<div class="sale-card">🧾 #${s.id} — ${new Date(s.created_at).toLocaleString()}<br>💰 ${s.total} ₸<br>👤 ${escapeHtml(s.seller_name)}<br>${currentUser.role==="admin"?`<button onclick="editSale(${s.id})">✏️</button><button onclick="deleteSale(${s.id})">🗑️</button>`:""}<button onclick="viewSaleDetails(${s.id})">📋</button></div>`).join(""); }
function clearSalesSearch() { const inp = document.getElementById("salesSearch"); if(inp) inp.value=""; filterSales(); }
function resetFilters() { const from=document.getElementById("filterFrom"); const to=document.getElementById("filterTo"); if(from) from.value=""; if(to) to.value=""; loadSalesHistory(); }
async function deleteSale(id) { if(currentUser.role!=="admin") return; if(!confirm("Удалить продажу?")) return; await fetch(`/api/sales/${id}`,{method:"DELETE",credentials:'include'}); await loadProducts(); await loadSalesHistory(); }
async function viewSaleDetails(id) { const res=await fetch(`/api/sales/${id}`,{credentials:'include'}); const sale=await res.json(); let msg=`Продажа от ${new Date(sale.created_at).toLocaleString()}\nСумма: ${sale.total} ₸\nПродавец: ${sale.seller_name}\nТовары:\n`; sale.items.forEach(i=>msg+=`- ${i.name} x${i.quantity} = ${i.price*i.quantity} ₸\n`); alert(msg); }
async function editSale(id) { if(currentUser.role!=="admin") return; const res=await fetch(`/api/sales/${id}`,{credentials:'include'}); const sale=await res.json(); editSaleId=sale.id; const editDate = document.getElementById("editSaleDatetime"); if(editDate) editDate.value=sale.created_at.slice(0,16); window.editCart=sale.items.map(i=>({product_id:i.product_id,name:i.name,price:i.price,quantity:i.quantity})); renderEditCart(); const modal = document.getElementById("editSaleModal"); if(modal) modal.style.display="flex"; }
function renderEditCart() { const container=document.getElementById("editCartItems"); if(!container) return; container.innerHTML=""; let total=0; window.editCart.forEach((item,idx)=>{ const product=products.find(p=>p.id===item.product_id); const price=product?product.price:item.price; const qty=item.quantity; const subtotal=price*qty; total+=subtotal; const row=document.createElement("div"); row.className="cart-row"; row.innerHTML=`<select onchange="changeEditProduct(${idx},this.value)"><option value="">-- Товар --</option>${products.map(p=>`<option value="${p.id}" ${item.product_id===p.id?"selected":""}>${escapeHtml(p.name)} (${p.price} ₸)</option>`).join("")}</select><input type="number" value="${qty}" min="1" onchange="changeEditQty(${idx},this.value)"><span>${subtotal.toFixed(2)} ₸</span><button onclick="removeEditItem(${idx})">✖</button>`; container.appendChild(row); }); const editTotal = document.getElementById("editCartTotal"); if(editTotal) editTotal.innerText=total.toFixed(2); }
function changeEditProduct(idx,pid){ const p=products.find(p=>p.id==pid); if(p){ window.editCart[idx].product_id=p.id; window.editCart[idx].name=p.name; window.editCart[idx].price=p.price; } else window.editCart[idx].product_id=null; renderEditCart(); }
function changeEditQty(idx,qty){ window.editCart[idx].quantity=parseInt(qty)||1; renderEditCart(); }
function removeEditItem(idx){ window.editCart.splice(idx,1); renderEditCart(); }
async function updateSale() { if(currentUser.role!=="admin") return; const newDate=document.getElementById("editSaleDatetime").value; const items=window.editCart.filter(i=>i.product_id&&i.quantity>0).map(i=>({product_id:i.product_id,quantity:i.quantity,price:i.price})); if(!items.length) return alert("Чек пуст"); const res=await fetch(`/api/sales/${editSaleId}`,{method:"PUT",headers:{"Content-Type":"application/json"},credentials:'include',body:JSON.stringify({items,sale_date:newDate})}); if(res.ok){ closeModal(); await loadProducts(); await loadSalesHistory(); alert("Продажа обновлена"); } else alert("Ошибка"); }
function closeModal(){ const modal = document.getElementById("editSaleModal"); if(modal) modal.style.display="none"; }

// ========== СКАНЕР ==========
function initScanner() {
  const scannerInput = document.getElementById("scannerInput");
  if(scannerInput) scannerInput.addEventListener("keypress", (e) => { if(e.key === "Enter") { e.preventDefault(); scanAndAdd(); } });
}
async function scanAndAdd() {
  const input = document.getElementById("scannerInput");
  const code = input.value.trim();
  if(!code) return;
  let product = null;
  product = products.find(p => p.barcode && p.barcode.toString() === code);
  if(!product) product = products.find(p => p.sku && p.sku.toString() === code);
  if(!product) { const id = parseInt(code); if(!isNaN(id)) product = products.find(p => p.id === id); }
  if(product) {
    const existing = cart.find(item => item.product_id === product.id);
    if(existing) existing.quantity += 1;
    else cart.push({ product_id: product.id, name: product.name, price: product.price, quantity: 1 });
    renderCart();
    input.value = "";
    input.focus();
    input.style.borderColor = "#4d6b3a";
    setTimeout(() => input.style.borderColor = "#b87c4f", 300);
  } else { alert(`Товар с кодом "${code}" не найден`); input.value = ""; input.focus(); }
}

// ========== ЭКСПОРТ PDF ==========
async function exportSalesToPDF() {
  if (!allSales.length) { alert("Нет данных для экспорта"); return; }
  let tableData = [];
  for (const sale of allSales) {
    try {
      const res = await fetch(`/api/sales/${sale.id}`, { credentials: 'include' });
      const saleDetail = await res.json();
      const saleTime = new Date(saleDetail.created_at).toLocaleString();
      if (saleDetail.items && saleDetail.items.length) {
        saleDetail.items.forEach(item => {
          tableData.push({
            name: item.name,
            datetime: saleTime,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.price * item.quantity
          });
        });
      }
    } catch(e) { console.error("Ошибка загрузки деталей продажи", sale.id); }
  }
  if (!tableData.length) { alert("Нет деталей продаж для экспорта"); return; }
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'absolute';
  tempDiv.style.left = '-9999px';
  tempDiv.style.top = '0';
  tempDiv.style.backgroundColor = 'white';
  tempDiv.style.padding = '20px';
  tempDiv.style.fontFamily = 'Arial, sans-serif';
  tempDiv.style.fontSize = '12px';
  tempDiv.style.color = '#1a1a1a';
  let html = `
    <h2 style="color: #b87c4f;">Детальный отчёт о продажах - EXPOSTROY</h2>
    <p><strong>Дата формирования:</strong> ${new Date().toLocaleString()}</p>
    <style>
      table { border-collapse: collapse; width: 100%; margin-top: 10px; }
      th, td { border: 1px solid #aaa; padding: 8px; text-align: left; }
      th { background-color: #b87c4f; color: white; font-weight: bold; }
      td { color: #1a1a1a; }
    </style>
    <table><thead><tr><th>Наименование</th><th>Время продажи</th><th>Кол-во</th><th>Цена (₸)</th><th>Сумма (₸)</th></tr></thead><tbody>
  `;
  let grandTotal = 0;
  tableData.forEach(row => {
    html += `<tr><td>${escapeHtml(row.name)}</td><td>${row.datetime}</td><td>${row.quantity}</td><td>${row.price.toFixed(2)}</td><td>${row.subtotal.toFixed(2)}</td></tr>`;
    grandTotal += row.subtotal;
  });
  html += `<tr style="font-weight:bold; background:#f0f0f0;"><td colspan="4" style="text-align:right;">ИТОГО:</td><td>${grandTotal.toFixed(2)} ₸</td></tr>`;
  html += `</tbody></table>`;
  tempDiv.innerHTML = html;
  document.body.appendChild(tempDiv);
  try {
    const canvas = await html2canvas(tempDiv, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const imgProps = doc.getImageProperties(imgData);
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    doc.save(`sales_details_${new Date().toISOString().slice(0,19)}.pdf`);
  } finally { document.body.removeChild(tempDiv); }
}

/// ========== ГОРЯЧИЕ КЛАВИШИ ==========
function initHotkeys() {
  document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
    if (!isInput && e.key >= '1' && e.key <= '8') {
      const idx = parseInt(e.key) - 1;
      if (availableTabs[idx]) { e.preventDefault(); switchTab(availableTabs[idx].id); }
    }
    if (e.key === 'Escape') {
      const drawer = document.getElementById("productDrawer");
      if (drawer && drawer.classList.contains('open')) closeDrawer();
      const modal = document.getElementById("editSaleModal");
      if (modal && modal.style.display === 'flex') closeModal();
      const prodModal = document.getElementById("editProductModal");
      if (prodModal && prodModal.style.display === 'flex') closeEditProductModal();
      const catModal = document.getElementById("newCategoryModal");
      if (catModal && catModal.style.display === 'flex') closeNewCategoryModal();
      const pickupModal = document.getElementById("pickupModal");
      if (pickupModal && pickupModal.style.display === 'flex') pickupModal.style.display = 'none';
    }
  });
}

function switchTab(tabId) {
  if (!availableTabs.some(t => t.id === tabId)) return;
  document.querySelectorAll(".tab-content").forEach(t=>t.classList.remove("active"));
  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add("active");
  document.querySelectorAll(".tab-btn").forEach(btn=>btn.classList.remove("active"));
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if(activeBtn) activeBtn.classList.add("active");
  if(tabId==="incoming") loadIncomingHistory();
  if(tabId==="history") loadSalesHistory();
  if(tabId==="users") loadUsers();
  if(tabId==="products") filterProducts();
  if(tabId==="sales") { renderCart(); setTimeout(()=>{ const sc=document.getElementById("scannerInput"); if(sc) sc.focus(); },100); }
  if(tabId==="dashboard" && currentUser.role==="admin") loadDashboard();
  if(tabId==="pickup") refreshPickupOrders();
  if(tabId==="customers") loadCustomers();
}

function escapeHtml(str) { if(!str) return ""; return str.replace(/[&<>]/g, m=>({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[m])); }

// ========== ФУНКЦИИ САМОВЫВОЗА ==========
async function refreshPickupOrders() {
  const res = await fetch('/api/market/orders', { credentials: 'include' });
  if (!res.ok) return;
  const orders = await res.json();
  const container = document.getElementById('pickupOrdersList');
  if (!container) return;
  container.innerHTML = orders.map(order => `
    <div class="incoming-card">
      <strong>Заказ #${order.order_token.slice(0,8)}</strong><br>
      📅 ${new Date(order.created_at).toLocaleString()}<br>
      ${order.customer_phone ? `👤 ${escapeHtml(order.customer_phone)}<br>` : ''}
      Статус: ${order.status === 'pending' ? '⏳ Ожидает' : '✅ Выдан'}<br>
      <button onclick="showPickupOrder('${order.order_token}')">Подробнее</button>
    </div>
  `).join('') || 'Нет активных заказов.';
}

async function showPickupOrder(token) {
  const res = await fetch(`/api/market/orders/${token}`, { credentials: 'include' });
  if (!res.ok) { alert('Заказ не найден'); return; }
  const order = await res.json();
  document.getElementById('pickupTokenInput').value = token;
  const detailsDiv = document.getElementById('pickupOrderDetails');
  const total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  detailsDiv.innerHTML = `
    <p><strong>Токен:</strong> ${order.order_token}</p>
    <p><strong>Создан:</strong> ${new Date(order.created_at).toLocaleString()}</p>
    ${order.customer_phone ? `<p><strong>Покупатель:</strong> ${escapeHtml(order.customer_phone)}</p>` : ''}
    <ul>${order.items.map(item => `<li>${item.name} x${item.quantity} = ${(item.price * item.quantity).toFixed(2)} ₸</li>`).join('')}</ul>
    <p><strong>Итого: ${total.toFixed(2)} ₸</strong></p>
    ${order.status === 'pending' ? `<button class="btn-success" onclick="completePickup('${token}')">✅ Выдать товар</button>` : '<p>Уже выдан</p>'}
  `;
  document.getElementById('pickupModal').style.display = 'flex';
}

async function completePickup(token) {
  if (!confirm('Подтвердить выдачу?')) return;
  const res = await fetch(`/api/market/orders/${token}/complete`, { method: 'POST', credentials: 'include' });
  if (res.ok) {
    alert('Товар выдан, продажа оформлена');
    document.getElementById('pickupModal').style.display = 'none';
    refreshPickupOrders();
    loadProducts();
  } else {
    const err = await res.json();
    alert(err.error || 'Ошибка');
  }
}

function showManualTokenInput() {
  document.getElementById('pickupTokenInput').value = '';
  document.getElementById('pickupOrderDetails').innerHTML = '';
  document.getElementById('pickupModal').style.display = 'flex';
}

function lookupPickupOrder() {
  const token = document.getElementById('pickupTokenInput').value.trim();
  if (token) showPickupOrder(token);
}

// ========== ПОКУПАТЕЛИ ==========
async function loadCustomers() {
  if (!["admin","seller"].includes(currentUser.role)) return;
  const res = await fetch('/api/market/customers', { credentials: 'include' });
  const customers = await res.json();
  const container = document.getElementById('customersList');
  if (!container) return;
  container.innerHTML = customers.map(c => `
    <div class="incoming-card">
      <strong>📱 ${escapeHtml(c.phone)}</strong><br>
      Сумма покупок: ${c.total_spent.toFixed(2)} ₸<br>
      Скидка: ${c.discount_enabled ? '✅ 1%' : '❌ нет'}
      <button onclick="toggleCustomerDiscount(${c.id})">${c.discount_enabled ? 'Отключить' : 'Включить'} скидку</button>
    </div>
  `).join('') || 'Нет покупателей.';
}

async function toggleCustomerDiscount(id) {
  const res = await fetch(`/api/market/customers/${id}/toggle-discount`, { method: 'POST', credentials: 'include' });
  if (res.ok) loadCustomers();
  else alert('Ошибка');
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
window.onload = () => {
  const saleDateTime = document.getElementById("saleDatetime");
  if (saleDateTime) saleDateTime.value = new Date().toISOString().slice(0,16);

  const closeDrawerBtn = document.querySelector(".drawer-close");
  if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", closeDrawer);
  const closeEditSaleBtn = document.querySelector(".close");
  if (closeEditSaleBtn) closeEditSaleBtn.addEventListener("click", closeModal);
  const closeEditProductBtn = document.querySelector(".close-edit-product");
  if (closeEditProductBtn) closeEditProductBtn.addEventListener("click", closeEditProductModal);
  const closeNewCategoryBtn = document.querySelector(".close-new-category");
  if (closeNewCategoryBtn) closeNewCategoryBtn.addEventListener("click", closeNewCategoryModal);

  const closePickupBtn = document.querySelector(".close-pickup");
  if (closePickupBtn) closePickupBtn.addEventListener("click", () => {
    document.getElementById('pickupModal').style.display = 'none';
  });

  window.onclick = (e) => {
    if (e.target === document.getElementById("editSaleModal")) closeModal();
    if (e.target === document.getElementById("productDrawer")) closeDrawer();
    if (e.target === document.getElementById("editProductModal")) closeEditProductModal();
    if (e.target === document.getElementById("newCategoryModal")) closeNewCategoryModal();
    if (e.target === document.getElementById("pickupModal")) document.getElementById('pickupModal').style.display = 'none';
  };

  checkAuth();
};