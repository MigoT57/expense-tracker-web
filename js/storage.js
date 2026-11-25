// js/storage.js
// Replaces the old backend + database. All transactions live in the visitor's
// own browser (localStorage), so nothing is ever sent to a server.
// The functions below mirror what the API used to return, so the dashboard
// code barely changed.

// Each account's transactions are stored under their own key:
// "ledger.transactions.v1.<username>". (The bare key is what the earlier,
// account-less version used; the first account created adopts that data.)
const STORAGE_KEY = 'ledger.transactions.v1';

const store = (() => {
  // Some browsers (private mode, blocked cookies) refuse localStorage. In that
  // case the app still works for the session, but nothing is saved.
  function storageWorks() {
    try {
      localStorage.setItem('__ledger_test', '1');
      localStorage.removeItem('__ledger_test');
      return true;
    } catch (e) {
      return false;
    }
  }

  const persistent = storageWorks();
  let memory = {};      // used only when browser storage is blocked
  let userKey = null;   // which account's data we're reading/writing

  function keyFor(user) {
    return `${STORAGE_KEY}.${user}`;
  }

  function currentKey() {
    if (!userKey) throw new Error('Not signed in.');
    return keyFor(userKey);
  }

  function all() {
    if (!persistent) return memory[userKey] || [];
    try {
      const parsed = JSON.parse(localStorage.getItem(currentKey()) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    if (!userKey) throw new Error('Not signed in.');
    if (!persistent) {
      memory[userKey] = list;
      return;
    }
    try {
      localStorage.setItem(currentKey(), JSON.stringify(list));
    } catch (e) {
      throw new Error('Could not save. Browser storage may be full or blocked.');
    }
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  // Same rules the old server enforced. Returns a clean copy or throws.
  function validate(input) {
    const type = input.type;
    if (type !== 'income' && type !== 'expense') {
      throw new Error('Type must be income or expense.');
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than zero.');
    }

    const category = String(input.category || '').trim();
    if (!category || category.length > 100) {
      throw new Error('Category is required.');
    }

    const date = String(input.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
      throw new Error('Please enter a valid date.');
    }

    const note = String(input.note || '').trim();
    if (note.length > 500) {
      throw new Error('Note must be 500 characters or fewer.');
    }

    return { type, amount: round2(amount), category, date, note: note || null };
  }

  const byDateDesc = (a, b) =>
    b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));

  return {
    persistent,

    // Choose whose data the other functions use (null = nobody / signed out).
    useUser(key) {
      userKey = key;
    },

    // Moves data saved by the old account-less version into this account.
    migrateLegacyTo(key) {
      if (!persistent) return false;
      try {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (!legacy) return false;
        localStorage.setItem(keyFor(key), legacy);
        localStorage.removeItem(STORAGE_KEY);
        return true;
      } catch (e) {
        return false;
      }
    },

    deleteUserData(key) {
      delete memory[key];
      if (!persistent) return;
      try {
        localStorage.removeItem(keyFor(key));
      } catch (e) {
        /* nothing else to do */
      }
    },

    list(limit = 50) {
      return [...all()].sort(byDateDesc).slice(0, limit);
    },

    create(input) {
      const tx = { id: newId(), ...validate(input), createdAt: new Date().toISOString() };
      save([...all(), tx]);
      return tx;
    },

    update(id, input) {
      const list = all();
      const index = list.findIndex((t) => t.id === id);
      if (index === -1) throw new Error('Transaction not found.');
      list[index] = { ...list[index], ...validate(input) };
      save(list);
      return list[index];
    },

    remove(id) {
      save(all().filter((t) => t.id !== id));
    },

    clear() {
      save([]);
    },

    // Balance + this month's income / expense (uses the visitor's local month).
    summary() {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      let income = 0, expense = 0, monthIncome = 0, monthExpense = 0;

      all().forEach((t) => {
        const inMonth = t.date.startsWith(month);
        if (t.type === 'income') {
          income += t.amount;
          if (inMonth) monthIncome += t.amount;
        } else {
          expense += t.amount;
          if (inMonth) monthExpense += t.amount;
        }
      });

      return {
        balance: round2(income - expense),
        totalIncome: round2(income),
        totalExpense: round2(expense),
        monthIncome: round2(monthIncome),
        monthExpense: round2(monthExpense),
      };
    },

    // Totals per category (and type), biggest first. Optional type filter.
    byCategory(type) {
      const groups = new Map();
      all()
        .filter((t) => !type || t.type === type)
        .forEach((t) => {
          const key = `${t.type}|${t.category}`;
          const g = groups.get(key) || { category: t.category, type: t.type, total: 0 };
          g.total += t.amount;
          groups.set(key, g);
        });

      return [...groups.values()]
        .map((g) => ({ ...g, total: round2(g.total) }))
        .sort((a, b) => b.total - a.total);
    },

    // Running balance per day that has transactions (most recent `days` days).
    balanceTrend(days = 30) {
      const list = all();
      const perDay = new Map();
      list.forEach((t) => {
        const d = perDay.get(t.date) || { date: t.date, income: 0, expense: 0 };
        d[t.type] += t.amount;
        perDay.set(t.date, d);
      });

      const rows = [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
      if (rows.length === 0) return [];

      let running = list
        .filter((t) => t.date < rows[0].date)
        .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);

      return rows.map((r) => {
        running += r.income - r.expense;
        return { date: r.date, income: r.income, expense: r.expense, balance: round2(running) };
      });
    },

    // --- Backup / restore -----------------------------------------------------
    exportJson() {
      return JSON.stringify(
        { app: 'ledger', version: 1, exportedAt: new Date().toISOString(), transactions: [...all()].sort(byDateDesc) },
        null,
        2
      );
    },

    // Replaces all current data with the contents of a backup file.
    importJson(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error('That file is not valid JSON.');
      }

      const items = Array.isArray(parsed) ? parsed : parsed && parsed.transactions;
      if (!Array.isArray(items)) throw new Error('No transactions found in that file.');

      const cleaned = items.map((item, i) => {
        try {
          return {
            id: typeof item.id === 'string' && item.id ? item.id : newId(),
            ...validate(item),
            createdAt: item.createdAt || new Date().toISOString(),
          };
        } catch (e) {
          throw new Error(`Entry ${i + 1}: ${e.message}`);
        }
      });

      save(cleaned);
      return cleaned.length;
    },
  };
})();
