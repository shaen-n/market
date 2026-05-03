let products = [];
let cart = [];
let currentCustomer = null; // { id, phone, total_spent, discount_enabled }
const API = '';

// Загрузка товаров
async function loadProducts() {
  const res = await fetch('/api/market/products');
  if (res.ok) {
    products = await res.json();
    renderCatalog();
  }
}

function renderCatalog() {
  const main = document.getElementById('mainContent');
  main.innerHTML = '<div class="products-grid">' + products.map(p => `
    <div class="product-card">
      <img src="${p.photo || ''}" alt="${escapeHtml(p.name)}" onerror="this.src='data:image/svg+xml,...'">
      <div class="product-info">
        <h3>${escapeHtml(p.name)}</h3>
        <div class="price">${p.price.toFixed(2)} ₸</div>
        <div class="stock">В наличии: ${p.stock} шт.</div>
        <button class="add-to-cart" onclick="addToCart(${p.id})">🛒 В корзину</button>
      </div>
    </div>
  `).join('') + '</div>';
}

// Корзина
function addToCart(pid) {
  const p = products.find(p => p.id === pid);
  if (!p || p.stock <= 0) return;
  const existing = cart.find(i => i.product_id === pid);
  if (existing) {
    if (existing.quantity < p.stock) existing.quantity++;
  } else {
    cart.push({ product_id: p.id, name: p.name, price: p.price, quantity: 1, stock: p.stock });
  }
  updateCartCount();
}

function renderCart() {
  const main = document.getElementById('mainContent');
  if (cart.length === 0) {
    main.innerHTML = '<p style="text-align:center; margin-top:50px;">Корзина пуста</p>';
    return;
  }
  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  let discountRow = '';
  if (currentCustomer?.discount_enabled) {
    const discount = total * 0.01;
    discountRow = `<p style="color:#27ae60;">Вам доступна скидка 1%: –${discount.toFixed(2)} ₸ (будет применена при оформлении)</p>`;
  }
  main.innerHTML = `
    <div class="cart-container">
      ${cart.map((item, idx) => `
        <div class="cart-item">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${item.price.toFixed(2)} ₸</span>
          <input type="number" value="${item.quantity}" min="1" max="${item.stock}" onchange="changeQty(${idx}, this.value)">
          <span>${(item.price * item.quantity).toFixed(2)} ₸</span>
          <button onclick="removeItem(${idx})" style="color:red;">Удалить</button>
        </div>
      `).join('')}
      <div class="total">Итого: ${total.toFixed(2)} ₸</div>
      ${discountRow}
      <button class="checkout-btn" onclick="checkout()">Оформить самовывоз</button>
    </div>
  `;
}

function changeQty(idx, val) {
  const qty = parseInt(val);
  if (isNaN(qty) || qty < 1) return;
  const item = cart[idx];
  if (qty > item.stock) { alert(`Максимум ${item.stock} шт.`); item.quantity = item.stock; }
  else item.quantity = qty;
  renderCart();
}

function removeItem(idx) { cart.splice(idx,1); updateCartCount(); renderCart(); }

async function checkout() {
  if (!currentCustomer) {
    alert('Пожалуйста, войдите в аккаунт для оформления заказа');
    showAuthModal('login');
    return;
  }
  if (cart.length === 0) return;
  const items = cart.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
  const res = await fetch('/api/market/orders', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ items })
  });
  if (!res.ok) { const err = await res.json(); alert(err.error || 'Ошибка'); return; }
  const order = await res.json();
  cart = [];
  updateCartCount();
  showQR(order.orderToken, order.total, order.discountApplied);
}

function showQR(token, total, discountApplied) {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="qr-container">
      <h2>Покажите QR-код продавцу</h2>
      ${discountApplied ? '<p style="color:#27ae60;">Скидка 1% применена!</p>' : ''}
      <p>Сумма к оплате: <strong>${total.toFixed(2)} ₸</strong></p>
      <div id="qrcode"></div>
      <button onclick="renderCatalog()">Вернуться в каталог</button>
    </div>
  `;
  new QRCode(document.getElementById("qrcode"), {
    text: JSON.stringify({ t: token }),
    width: 200,
    height: 200
  });
}

// Авторизация и регистрация
async function loginOrRegister() {
  const phone = document.getElementById('authPhone').value.replace(/\D/g, '');
  const password = document.getElementById('authPassword').value;
  if (!phone || !password) {
    document.getElementById('authError').textContent = 'Заполните все поля';
    return;
  }
  // Пытаемся войти
  let res = await fetch('/api/login', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ username: phone, password })
  });
  if (res.ok) {
    const data = await res.json();
    if (data.role === 'customer') {
      await loadCustomerInfo();
      closeAuthModal();
      return;
    } else {
      document.getElementById('authError').textContent = 'Этот номер принадлежит сотруднику';
      return;
    }
  }
  // Если не получилось, регистрируем
  res = await fetch('/api/market/register', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ phone, password })
  });
  if (res.ok) {
    await loadCustomerInfo();
    closeAuthModal();
  } else {
    const err = await res.json();
    document.getElementById('authError').textContent = err.error || 'Ошибка';
  }
}

async function loadCustomerInfo() {
  const res = await fetch('/api/market/customer');
  if (res.ok) {
    currentCustomer = await res.json();
    document.getElementById('accountLabel').textContent = currentCustomer.phone || 'Профиль';
    document.getElementById('profilePhone').textContent = currentCustomer.phone;
    document.getElementById('profileTotal').textContent = (currentCustomer.total_spent || 0).toFixed(2);
    document.getElementById('profileDiscount').textContent = currentCustomer.discount_enabled ? '1% (активна)' : 'нет';
  }
}

function logoutCustomer() {
  fetch('/api/logout', { method: 'POST' }).then(() => {
    currentCustomer = null;
    document.getElementById('accountLabel').textContent = 'Войти';
    closeAuthModal();
  });
}

function showAuthModal() {
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('authForm').style.display = 'block';
  document.getElementById('authProfile').style.display = 'none';
}
function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

// Инициализация
document.getElementById('catalogBtn').addEventListener('click', renderCatalog);
document.getElementById('cartBtn').addEventListener('click', renderCart);
document.getElementById('accountBtn').addEventListener('click', () => {
  if (currentCustomer) {
    document.getElementById('authModal').style.display = 'flex';
    document.getElementById('authForm').style.display = 'none';
    document.getElementById('authProfile').style.display = 'block';
    document.getElementById('profilePhone').textContent = currentCustomer.phone;
    document.getElementById('profileTotal').textContent = (currentCustomer.total_spent || 0).toFixed(2);
    document.getElementById('profileDiscount').textContent = currentCustomer.discount_enabled ? '1% (активна)' : 'нет';
  } else {
    showAuthModal();
  }
});
document.querySelector('.close-auth')?.addEventListener('click', closeAuthModal);
window.onclick = (e) => { if (e.target === document.getElementById('authModal')) closeAuthModal(); };

function updateCartCount() {
  document.getElementById('cartCount').textContent = cart.reduce((s,i) => s + i.quantity, 0);
}

function escapeHtml(str) {
  return str.replace(/[&<>"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;"})[m]);
}

// Проверяем сессию при загрузке
(async () => {
  const res = await fetch('/api/market/customer');
  if (res.ok) {
    currentCustomer = await res.json();
    document.getElementById('accountLabel').textContent = currentCustomer.phone || 'Профиль';
  } else {
    currentCustomer = null;
  }
  await loadProducts();
})();