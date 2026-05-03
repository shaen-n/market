const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));
app.use(session({
  secret: "loft-inventory-secret-2025",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Папки для загрузок
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

// Раздача статики
const distDir = path.join(__dirname, "dist");
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
app.use(express.static(distDir));

const marketDist = path.join(__dirname, "marketplace-dist");
if (!fs.existsSync(marketDist)) fs.mkdirSync(marketDist, { recursive: true });
app.use("/market", express.static(marketDist));

// Настройка multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// База данных
const db = new sqlite3.Database("./database.db");

db.serialize(() => {
  // Удаляем старую таблицу users с неправильным CHECK
  db.run(`DROP TABLE IF EXISTS users`);

  // Создаём заново с правильным CHECK
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'seller', 'customer')),
    phone TEXT,
    total_spent REAL DEFAULT 0,
    discount_enabled INTEGER DEFAULT 0
  )`);

  // Остальные таблицы остаются без изменений
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT,
    barcode TEXT,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    photo TEXT,
    description TEXT,
    category_id INTEGER,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS incoming (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    datetime TEXT NOT NULL,
    comment TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pickup_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_token TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
    customer_note TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (customer_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pickup_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES pickup_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  // ALTER для совместимости (теперь не нужно для users, но оставим для других таблиц)
  db.run(`ALTER TABLE products ADD COLUMN barcode TEXT`, () => {});
  db.run(`ALTER TABLE products ADD COLUMN category_id INTEGER`, () => {});
  db.run(`ALTER TABLE sales ADD COLUMN user_id INTEGER DEFAULT 1`, () => {});
  db.run(`ALTER TABLE products ADD COLUMN description TEXT`, () => {});
  db.run(`ALTER TABLE pickup_orders ADD COLUMN customer_id INTEGER`, () => {});

  // Категория по умолчанию
  db.get("SELECT COUNT(*) as cnt FROM categories", [], (err, row) => {
    if (!err && row && row.cnt === 0) {
      db.run("INSERT INTO categories (name) VALUES (?)", ["Без категории"]);
    }
  });

  // Администратор по умолчанию
  db.get("SELECT COUNT(*) as cnt FROM users", [], async (err, row) => {
    if (!err && row && row.cnt === 0) {
      const hash = await bcrypt.hash("admin123", 10);
      db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ["admin", hash, "admin"]);
      console.log("Создан администратор admin / admin123");
    }
  });
});

// ========== МИДЛВЕРЫ ==========
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: "Не авторизован" });
}
function isAdmin(req, res, next) {
  if (req.session.user?.role === "admin") return next();
  res.status(403).json({ error: "Только для администратора" });
}
function isStaff(req, res, next) {
  if (req.session.user?.role === "admin" || req.session.user?.role === "seller") return next();
  res.status(403).json({ error: "Доступ запрещён" });
}

// ========== АУТЕНТИФИКАЦИЯ ==========
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Неверный логин или пароль" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Неверный логин или пароль" });
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ role: user.role });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  if (req.session.user) res.json(req.session.user);
  else res.status(401).json({ error: "Не авторизован" });
});

// ========== РЕГИСТРАЦИЯ ==========
app.post("/api/market/register", async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: "Номер телефона и пароль обязательны" });
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) return res.status(400).json({ error: "Введите корректный номер телефона" });

    const hash = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, password, role, phone) VALUES (?, ?, 'customer', ?)", [cleanPhone, hash, cleanPhone], function(err) {
      if (err) {
        console.error("Ошибка регистрации:", err);
        if (err.message.includes("UNIQUE constraint")) return res.status(400).json({ error: "Этот номер уже зарегистрирован" });
        return res.status(500).json({ error: "Ошибка регистрации" });
      }
      req.session.user = { id: this.lastID, username: cleanPhone, role: "customer" };
      res.json({ success: true });
    });
  } catch (e) {
    console.error("Исключение в регистрации:", e);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// ========== ДАННЫЕ ПОКУПАТЕЛЯ ==========
app.get("/api/market/customer", isAuthenticated, (req, res) => {
  if (req.session.user.role !== "customer") return res.status(403).json({ error: "Не покупатель" });
  db.get("SELECT id, phone, total_spent, discount_enabled FROM users WHERE id = ?", [req.session.user.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Покупатель не найден" });
    res.json(row);
  });
});

// ========== СПИСОК ПОКУПАТЕЛЕЙ (для персонала) ==========
app.get("/api/market/customers", isStaff, (req, res) => {
  db.all("SELECT id, username as phone, total_spent, discount_enabled FROM users WHERE role = 'customer' ORDER BY id", [], (err, rows) => res.json(rows || []));
});

// ========== ПЕРЕКЛЮЧЕНИЕ СКИДКИ ==========
app.post("/api/market/customers/:id/toggle-discount", isStaff, (req, res) => {
  const customerId = req.params.id;
  db.get("SELECT discount_enabled FROM users WHERE id = ? AND role = 'customer'", [customerId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Покупатель не найден" });
    const newVal = user.discount_enabled ? 0 : 1;
    db.run("UPDATE users SET discount_enabled = ? WHERE id = ?", [newVal, customerId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ discount_enabled: newVal });
    });
  });
});

// ========== КАТЕГОРИИ ==========
app.get("/api/categories", isAuthenticated, (req, res) => {
  db.all("SELECT * FROM categories ORDER BY name", [], (err, rows) => res.json(rows));
});

app.post("/api/categories", isAuthenticated, isAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Название категории обязательно" });
  db.run("INSERT INTO categories (name) VALUES (?)", [name], function(err) {
    if (err) return res.status(500).json({ error: "Такая категория уже существует" });
    res.json({ id: this.lastID });
  });
});

app.delete("/api/categories/:id", isAuthenticated, isAdmin, (req, res) => {
  const id = req.params.id;
  db.run("UPDATE products SET category_id = NULL WHERE category_id = ?", [id], (err) => {
    db.run("DELETE FROM categories WHERE id = ?", [id], function(err) {
      if (err) return res.status(500).json({ error: "Ошибка удаления" });
      res.json({ success: true });
    });
  });
});

// ========== ТОВАРЫ ==========
app.get("/api/products", isAuthenticated, (req, res) => {
  db.all("SELECT * FROM products ORDER BY id", [], (err, rows) => res.json(rows));
});

app.post("/api/products", isAuthenticated, isAdmin, upload.single("photo"), (req, res) => {
  const { name, sku, barcode, price, stock, description, category_id } = req.body;
  const photo = req.file ? "/uploads/" + req.file.filename : null;
  db.run(
    "INSERT INTO products (name, sku, barcode, price, stock, photo, description, category_id) VALUES (?,?,?,?,?,?,?,?)",
    [name, sku || "", barcode || "", parseFloat(price), parseInt(stock) || 0, photo, description || "", category_id || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.put("/api/products/:id", isAuthenticated, isAdmin, (req, res) => {
  const { name, sku, barcode, price, description, category_id } = req.body;
  db.run(
    "UPDATE products SET name=?, sku=?, barcode=?, price=?, description=?, category_id=? WHERE id=?",
    [name, sku || "", barcode || "", price, description || "", category_id || null, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.put("/api/products/:id/photo", isAuthenticated, isAdmin, upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Нет файла" });
  db.run("UPDATE products SET photo = ? WHERE id = ?", ["/uploads/" + req.file.filename, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, photo: "/uploads/" + req.file.filename });
  });
});

app.put("/api/products/:id/description", isAuthenticated, isAdmin, (req, res) => {
  const { description } = req.body;
  db.run("UPDATE products SET description = ? WHERE id = ?", [description, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete("/api/products/:id", isAuthenticated, isAdmin, (req, res) => {
  db.get("SELECT 1 FROM incoming WHERE product_id=? LIMIT 1", [req.params.id], (err, row) => {
    if (row) return res.status(400).json({ error: "Есть приходы" });
    db.get("SELECT 1 FROM sale_items WHERE product_id=? LIMIT 1", [req.params.id], (err, row2) => {
      if (row2) return res.status(400).json({ error: "Есть продажи" });
      db.run("DELETE FROM products WHERE id=?", [req.params.id], function(err) { res.json({ success: true }); });
    });
  });
});

// ========== ПРИХОДЫ ==========
app.get("/api/incoming", isAuthenticated, isAdmin, (req, res) => {
  db.all(
    "SELECT incoming.*, products.name as product_name FROM incoming JOIN products ON incoming.product_id=products.id ORDER BY datetime DESC",
    [], (err, rows) => res.json(rows));
});

app.post("/api/incoming", isAuthenticated, isAdmin, (req, res) => {
  const { product_id, quantity, datetime, comment } = req.body;
  db.run("UPDATE products SET stock = stock + ? WHERE id = ?", [quantity, product_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run(
      "INSERT INTO incoming (product_id, quantity, datetime, comment) VALUES (?,?,?,?)",
      [product_id, quantity, datetime || new Date().toISOString(), comment || ""],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

app.put("/api/incoming/:id", isAuthenticated, isAdmin, (req, res) => {
  const { quantity, datetime, comment } = req.body;
  db.get("SELECT product_id, quantity FROM incoming WHERE id=?", [req.params.id], (err, old) => {
    if (!old) return res.status(404).json({ error: "Приход не найден" });
    const delta = quantity - old.quantity;
    db.run("UPDATE products SET stock = stock + ? WHERE id = ?", [delta, old.product_id], (err) => {
      db.run("UPDATE incoming SET quantity=?, datetime=?, comment=? WHERE id=?", [quantity, datetime, comment, req.params.id], (err) => res.json({ success: true }));
    });
  });
});

app.delete("/api/incoming/:id", isAuthenticated, isAdmin, (req, res) => {
  db.get("SELECT product_id, quantity FROM incoming WHERE id=?", [req.params.id], (err, row) => {
    if (!row) return res.status(404).json({ error: "Приход не найден" });
    db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [row.quantity, row.product_id], (err) => {
      db.run("DELETE FROM incoming WHERE id=?", [req.params.id], (err) => res.json({ success: true }));
    });
  });
});

// ========== ПРОДАЖИ ==========
app.get("/api/sales", isAuthenticated, (req, res) => {
  let sql = `SELECT sales.*, users.username as seller_name FROM sales JOIN users ON sales.user_id = users.id WHERE 1=1`;
  const params = [];
  if (req.query.from) { sql += " AND sales.created_at >= ?"; params.push(req.query.from); }
  if (req.query.to) { sql += " AND sales.created_at <= ?"; params.push(req.query.to); }
  sql += " ORDER BY sales.created_at DESC";
  db.all(sql, params, (err, rows) => res.json(rows));
});

app.get("/api/sales/:id", isAuthenticated, (req, res) => {
  db.get("SELECT * FROM sales WHERE id=?", [req.params.id], (err, sale) => {
    if (!sale) return res.status(404).json({ error: "Продажа не найдена" });
    db.all("SELECT sale_items.*, products.name FROM sale_items JOIN products ON sale_items.product_id=products.id WHERE sale_id=?", [req.params.id], (err, items) => res.json({ ...sale, items }));
  });
});

app.post("/api/sales", isAuthenticated, (req, res) => {
  const { items, sale_date } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: "Нет товаров" });
  let total = 0;
  items.forEach(i => total += i.price * i.quantity);
  const date = sale_date || new Date().toISOString();
  const userId = req.session.user.id;
  db.run("INSERT INTO sales (user_id, total, created_at) VALUES (?,?,?)", [userId, total, date], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    const saleId = this.lastID;
    let counter = 0;
    items.forEach(item => {
      db.run("INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?,?,?,?)", [saleId, item.product_id, item.quantity, item.price], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.product_id], (err) => {
          counter++;
          if (counter === items.length) res.json({ id: saleId });
        });
      });
    });
  });
});

app.put("/api/sales/:id", isAuthenticated, isAdmin, (req, res) => {
  const { items, sale_date } = req.body;
  const saleId = req.params.id;
  db.get("SELECT created_at FROM sales WHERE id=?", [saleId], (err, oldSale) => {
    if (!oldSale) return res.status(404).json({ error: "Продажа не найдена" });
    db.all("SELECT product_id, quantity FROM sale_items WHERE sale_id=?", [saleId], (err, oldItems) => {
      let restored = 0;
      if (oldItems.length === 0) update();
      oldItems.forEach(item => {
        db.run("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantity, item.product_id], (err) => {
          restored++;
          if (restored === oldItems.length) update();
        });
      });
      function update() {
        db.run("DELETE FROM sale_items WHERE sale_id=?", [saleId], (err) => {
          let total = 0;
          items.forEach(i => total += i.price * i.quantity);
          db.run("UPDATE sales SET total=?, created_at=? WHERE id=?", [total, sale_date || oldSale.created_at, saleId], (err) => {
            let inserted = 0;
            items.forEach(item => {
              db.run("INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?,?,?,?)", [saleId, item.product_id, item.quantity, item.price], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.product_id], (err) => {
                  inserted++;
                  if (inserted === items.length) res.json({ success: true });
                });
              });
            });
          });
        });
      }
    });
  });
});

app.delete("/api/sales/:id", isAuthenticated, isAdmin, (req, res) => {
  const saleId = req.params.id;
  db.all("SELECT product_id, quantity FROM sale_items WHERE sale_id=?", [saleId], (err, items) => {
    let updated = 0;
    if (items.length === 0) del();
    items.forEach(item => {
      db.run("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantity, item.product_id], (err) => {
        updated++;
        if (updated === items.length) del();
      });
    });
    function del() {
      db.run("DELETE FROM sales WHERE id=?", [saleId], (err) => res.json({ success: true }));
    }
  });
});

// ========== ПОЛЬЗОВАТЕЛИ (старый функционал) ==========
app.get("/api/users", isAuthenticated, isAdmin, (req, res) => {
  db.all("SELECT id, username, role FROM users WHERE role IN ('admin', 'seller')", [], (err, rows) => res.json(rows));
});

app.post("/api/users", isAuthenticated, isAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: "Все поля обязательны" });
  if (!["admin", "seller"].includes(role)) return res.status(400).json({ error: "Недопустимая роль" });
  const hash = await bcrypt.hash(password, 10);
  db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, hash, role], function(err) {
    if (err) return res.status(500).json({ error: "Имя уже существует" });
    res.json({ id: this.lastID });
  });
});

app.put("/api/users/:id/password", isAuthenticated, (req, res) => {
  const { newPassword } = req.body;
  const targetId = req.params.id;
  if (req.session.user.role !== "admin" && req.session.user.id != targetId)
    return res.status(403).json({ error: "Нет прав" });
  bcrypt.hash(newPassword, 10, (err, hash) => {
    db.run("UPDATE users SET password = ? WHERE id = ?", [hash, targetId], (err) => res.json({ success: true }));
  });
});

app.delete("/api/users/:id", isAuthenticated, isAdmin, (req, res) => {
  const id = req.params.id;
  db.get("SELECT role FROM users WHERE id = ?", [id], (err, user) => {
    if (!user) return res.status(404).json({ error: "Не найден" });
    if (user.role === "admin") {
      db.get("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'", [], (err, row) => {
        if (row.cnt <= 1) return res.status(400).json({ error: "Нельзя удалить единственного админа" });
        proceedDelete();
      });
    } else proceedDelete();
    function proceedDelete() {
      db.run("DELETE FROM users WHERE id = ?", [id], (err) => res.json({ success: true }));
    }
  });
});

// ========== ОТЧЁТЫ ==========
app.get("/api/reports/dashboard", isAuthenticated, isAdmin, (req, res) => {
  db.get("SELECT COUNT(*) as totalProducts, SUM(stock) as totalStock, SUM(price * stock) as totalValue FROM products", [], (err, productStats) => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    db.get("SELECT COUNT(*) as salesCount, SUM(total) as salesTotal FROM sales WHERE created_at BETWEEN ? AND ?", [firstDay, lastDay], (err, salesStats) => {
      db.all(`SELECT date(created_at) as day, SUM(total) as total FROM sales WHERE created_at BETWEEN ? AND ? GROUP BY date(created_at) ORDER BY day`, [firstDay, lastDay], (err, dailySales) => {
        db.all(`SELECT products.id, products.name, SUM(sale_items.quantity) as sold FROM sale_items JOIN products ON sale_items.product_id = products.id GROUP BY products.id ORDER BY sold DESC LIMIT 5`, [], (err, topProducts) => {
          db.all("SELECT id, name, stock FROM products WHERE stock < 5 ORDER BY stock ASC", [], (err, lowStock) => {
            res.json({
              products: productStats,
              monthSales: salesStats,
              dailySales: dailySales || [],
              topProducts: topProducts || [],
              lowStock: lowStock || []
            });
          });
        });
      });
    });
  });
});

// ========== МАРКЕТПЛЕЙС: ПУБЛИЧНЫЕ ==========
app.get("/api/market/products", (req, res) => {
  db.all("SELECT id, name, price, photo, description, stock, category_id, sku FROM products WHERE stock > 0 ORDER BY name", [], (err, rows) => {
    if (err) {
      console.error("Ошибка получения товаров:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

app.get("/api/market/products/:id", (req, res) => {
  db.get("SELECT id, name, price, photo, description, stock, category_id, sku FROM products WHERE id = ?", [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Товар не найден" });
    res.json(row);
  });
});

// Создание заказа (только для авторизованного покупателя)
app.post("/api/market/orders", isAuthenticated, (req, res) => {
  if (req.session.user.role !== "customer") return res.status(403).json({ error: "Только для покупателей" });
  const customerId = req.session.user.id;
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: "Нет товаров" });

  db.get("SELECT discount_enabled FROM users WHERE id = ?", [customerId], (err, user) => {
    if (err || !user) return res.status(500).json({ error: "Ошибка данных покупателя" });
    const discount = user.discount_enabled ? 0.01 : 0;

    const ids = items.map(i => i.product_id);
    db.all("SELECT id, price, stock FROM products WHERE id IN (" + ids.map(() => "?").join(",") + ")", ids, (err, products) => {
      if (err) return res.status(500).json({ error: err.message });
      const map = {};
      products.forEach(p => map[p.id] = p);

      let total = 0;
      const validated = [];
      for (const item of items) {
        const prod = map[item.product_id];
        if (!prod) return res.status(400).json({ error: `Товар с ID ${item.product_id} не найден` });
        if (item.quantity > prod.stock) return res.status(400).json({ error: `Недостаточно "${prod.name}" (${prod.stock} шт.)` });
        const discountedPrice = discount > 0 ? +(prod.price * (1 - discount)).toFixed(2) : prod.price;
        validated.push({ product_id: prod.id, quantity: item.quantity, price: discountedPrice });
        total += discountedPrice * item.quantity;
      }

      const token = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      db.run("INSERT INTO pickup_orders (order_token, customer_id, created_at) VALUES (?, ?, ?)", [token, customerId, createdAt], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const orderId = this.lastID;
        let inserted = 0;
        validated.forEach(item => {
          db.run("INSERT INTO pickup_order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
            [orderId, item.product_id, item.quantity, item.price], (err) => {
              if (err) return res.status(500).json({ error: err.message });
              inserted++;
              if (inserted === validated.length) {
                res.json({ orderId, orderToken: token, total, createdAt, items: validated, discountApplied: discount > 0 });
              }
            });
        });
      });
    });
  });
});

// ========== МАРКЕТПЛЕЙС: ДЛЯ ПЕРСОНАЛА ==========
app.get("/api/market/orders", isStaff, (req, res) => {
  db.all(
    `SELECT pickup_orders.*, users.phone as customer_phone 
     FROM pickup_orders 
     LEFT JOIN users ON pickup_orders.customer_id = users.id 
     WHERE pickup_orders.status = 'pending' 
     ORDER BY pickup_orders.created_at DESC`,
    [], (err, rows) => res.json(rows || [])
  );
});

app.get("/api/market/orders/:token", isStaff, (req, res) => {
  const token = req.params.token;
  db.get("SELECT * FROM pickup_orders WHERE order_token = ?", [token], (err, order) => {
    if (err || !order) return res.status(404).json({ error: "Заказ не найден" });
    db.all(
      `SELECT poi.quantity, poi.price, p.name, p.id as product_id
       FROM pickup_order_items poi
       JOIN products p ON poi.product_id = p.id
       WHERE poi.order_id = ?`,
      [order.id],
      (err, items) => {
        if (err) return res.status(500).json({ error: err.message });
        let customerPhone = null;
        if (order.customer_id) {
          db.get("SELECT phone FROM users WHERE id = ?", [order.customer_id], (err, userRow) => {
            if (userRow) customerPhone = userRow.phone;
            res.json({ ...order, items, customer_phone: customerPhone });
          });
        } else {
          res.json({ ...order, items, customer_phone: null });
        }
      }
    );
  });
});

// Завершение заказа (выдача товара)
app.post("/api/market/orders/:token/complete", isStaff, (req, res) => {
  const token = req.params.token;
  const staffId = req.session.user.id;

  db.get("SELECT * FROM pickup_orders WHERE order_token = ? AND status = 'pending'", [token], (err, order) => {
    if (err || !order) return res.status(404).json({ error: "Заказ не найден или уже обработан" });

    db.all(`SELECT poi.product_id, poi.quantity, poi.price
            FROM pickup_order_items poi
            WHERE poi.order_id = ?`, [order.id], (err, items) => {
      if (err) return res.status(500).json({ error: err.message });

      const productIds = items.map(i => i.product_id);
      db.all("SELECT id, stock FROM products WHERE id IN (" + productIds.map(() => "?").join(",") + ")", productIds, (err, prods) => {
        if (err) return res.status(500).json({ error: err.message });
        const stockMap = {};
        prods.forEach(p => stockMap[p.id] = p.stock);
        for (const item of items) {
          if (item.quantity > stockMap[item.product_id]) {
            return res.status(400).json({ error: `Недостаточно товара ID ${item.product_id}` });
          }
        }

        let total = 0;
        items.forEach(i => total += i.price * i.quantity);
        const now = new Date().toISOString();

        db.run("INSERT INTO sales (user_id, total, created_at) VALUES (?, ?, ?)", [staffId, total, now], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          const saleId = this.lastID;

          let done = 0;
          items.forEach(item => {
            db.run("INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
              [saleId, item.product_id, item.quantity, item.price], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.product_id], (err) => {
                  done++;
                  if (done === items.length) {
                    db.run("UPDATE pickup_orders SET status = 'completed', completed_at = ? WHERE id = ?", [now, order.id], (err) => {
                      if (err) return res.status(500).json({ error: err.message });

                      if (order.customer_id) {
                        db.run("UPDATE users SET total_spent = total_spent + ? WHERE id = ?", [total, order.customer_id], (err) => {
                          if (!err) {
                            db.get("SELECT total_spent FROM users WHERE id = ?", [order.customer_id], (err, row) => {
                              if (row && row.total_spent >= 1000000) {
                                db.run("UPDATE users SET discount_enabled = 1 WHERE id = ? AND discount_enabled = 0", [order.customer_id]);
                              }
                            });
                          }
                        });
                      }
                      res.json({ success: true, saleId });
                    });
                  }
                });
              });
          });
        });
      });
    });
  });
});

// ========== ОБСЛУЖИВАНИЕ SPA ==========
app.get('*', (req, res) => {
  if (req.path.startsWith('/market')) {
    res.sendFile(path.join(marketDist, 'index.html'));
  } else {
    res.sendFile(path.join(distDir, 'index.html'));
  }
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
