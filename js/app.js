// js/app.js
// Drives the sign-in screen and the dashboard: reads the signed-in account's
// transactions from browser storage (see storage.js and auth.js), renders the
// list of entries, and keeps the charts in sync whenever a transaction changes.

const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Housing', 'Utilities', 'Entertainment', 'Health', 'Shopping', 'Other'];
const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'];

// Every category gets its own hue from the colour wheel, with no hue used twice.
// Saturation and lightness are kept low so the colours stay soft on the dark
// background. Expense hues sit 45 degrees apart; income hues fall in the gaps.
const EXPENSE_HUES = {
  Food: 12,
  Utilities: 57,
  Housing: 102,
  Health: 147,
  Transport: 192,
  Shopping: 237,
  Entertainment: 282,
  Other: 327,
};

const INCOME_HUES = {
  Salary: 34,
  Freelance: 124,
  Other: 169,
  Investment: 214,
  Gift: 304,
};

const wheelColor = (hue, type) =>
  type === 'income' ? `hsl(${hue}, 48%, 60%)` : `hsl(${hue}, 46%, 52%)`;

// Categories that are not in the lists above (for example from an imported
// file) get their own hue too, stepping around the wheel by the golden angle.
const extraHues = new Map();

function getCategoryColor(name, type) {
  const hues = type === 'income' ? INCOME_HUES : EXPENSE_HUES;
  if (hues[name] !== undefined) return wheelColor(hues[name], type);

  const key = `${type}:${name}`;
  if (!extraHues.has(key)) extraHues.set(key, (extraHues.size * 137.5 + 20) % 360);
  return wheelColor(Math.round(extraHues.get(key)), type);
}

// Percentages (to 0.1%) that always add up to exactly 100, using the
// largest-remainder method so rounding never leaves 99.9% or 100.1%.
function percentages(values) {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (!total) return values.map(() => 0);

  const tenths = values.map((v) => (v / total) * 1000);
  const result = tenths.map(Math.floor);
  let missing = 1000 - result.reduce((sum, v) => sum + v, 0);

  tenths
    .map((v, i) => ({ i, remainder: v - Math.floor(v) }))
    .sort((x, y) => y.remainder - x.remainder)
    .slice(0, missing)
    .forEach(({ i }) => { result[i] += 1; });

  return result.map((v) => v / 10);
}

// Chart.js defaults: light text and a font stack with proper fallbacks.
Chart.defaults.color = '#ffffff';
Chart.defaults.font.family = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const state = {
  editingId: null,
};

let categoryChart = null;
let trendChart = null;
let balanceLineChart = null;

document.addEventListener('DOMContentLoaded', () => {
  setupAuthScreen();
  setupForm();
  setupBackupButtons();
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  if (!store.persistent) {
    document.getElementById('storage-warning').hidden = false;
  }

  const user = auth.currentUser();
  if (user) enterApp(user);
  else showAuth('login');
});

function refreshAll() {
  loadSummary();
  loadTransactions();
  loadCategoryChart();
  loadTrendChart();
  loadBalanceLineChart();
}

// --- Sign in / create account / log out --------------------------------------

let authMode = 'login';

function setupAuthScreen() {
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
  });
  document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
  document.getElementById('forgot-btn').addEventListener('click', handleForgotPassword);
}

function setAuthMode(mode) {
  authMode = mode;
  const register = mode === 'register';

  document.getElementById('tab-login').classList.toggle('active', !register);
  document.getElementById('tab-register').classList.toggle('active', register);
  document.getElementById('auth-title').textContent = register ? 'Create your account' : 'Welcome back';
  document.getElementById('auth-sub').textContent = register
    ? 'Pick a username and password. No email needed.'
    : 'Log in to see where your money went.';
  document.getElementById('auth-submit').textContent = register ? 'Create account' : 'Log in';
  document.getElementById('confirm-field').hidden = !register;
  document.getElementById('forgot-btn').hidden = register;
  document.getElementById('auth-password').autocomplete = register ? 'new-password' : 'current-password';

  document.getElementById('auth-password').value = '';
  document.getElementById('auth-confirm').value = '';
  showAuthMessage('', '');
}

// kind: 'error' | 'info' | '' (clears both)
function showAuthMessage(kind, text) {
  const error = document.getElementById('auth-error');
  const info = document.getElementById('auth-info');
  error.hidden = kind !== 'error';
  info.hidden = kind !== 'info';
  error.textContent = kind === 'error' ? text : '';
  info.textContent = kind === 'info' ? text : '';
}

function showAuth(mode) {
  document.getElementById('app-view').hidden = true;
  document.getElementById('auth-view').hidden = false;
  document.getElementById('auth-username').value = '';
  // Someone opening the app for the first time has no account yet.
  setAuthMode(auth.hasUsers() ? mode : 'register');
  document.getElementById('auth-username').focus();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  showAuthMessage('', '');

  const username = document.getElementById('auth-username').value;
  const password = document.getElementById('auth-password').value;
  const remember = document.getElementById('auth-remember').checked;
  const submitBtn = document.getElementById('auth-submit');

  if (authMode === 'register' && password !== document.getElementById('auth-confirm').value) {
    showAuthMessage('error', 'Passwords do not match.');
    return;
  }

  submitBtn.disabled = true;
  try {
    const user = authMode === 'register'
      ? await auth.register(username, password, remember)
      : await auth.login(username, password, remember);
    document.getElementById('auth-form').reset();
    enterApp(user);
  } catch (err) {
    showAuthMessage('error', err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

// There is no email, so a forgotten password can't be reset. The only way out
// is to delete the account (and its data) and start again.
function handleForgotPassword() {
  const username = document.getElementById('auth-username').value.trim();
  if (!username) {
    showAuthMessage('error', 'Type your username above first.');
    return;
  }
  if (!auth.userExists(username)) {
    showAuthMessage('error', 'There is no account with that username on this device.');
    return;
  }

  const ok = confirm(
    `Passwords can't be recovered (no email is used).\n\n` +
    `You can delete the account "${username}" and ALL of its saved transactions from this browser, then create it again. ` +
    `If you exported a backup earlier, you can import it afterwards.\n\nContinue?`
  );
  if (!ok) return;
  if (prompt('To confirm, type DELETE (in capital letters).') !== 'DELETE') return;

  auth.deleteAccount(username);
  setAuthMode('register');
  document.getElementById('auth-username').value = username;
  showAuthMessage('info', 'Account deleted. You can create it again below.');
}

function enterApp(user) {
  store.useUser(user.key);
  document.getElementById('user-name').textContent = user.username;
  document.getElementById('auth-view').hidden = true;
  document.getElementById('app-view').hidden = false;
  resetForm();
  refreshAll();
  window.scrollTo(0, 0);
}

function handleLogout() {
  auth.logout();
  store.useUser(null);

  // Charts are rebuilt for whoever signs in next.
  [categoryChart, trendChart, balanceLineChart].forEach((c) => c && c.destroy());
  categoryChart = trendChart = balanceLineChart = null;
  document.getElementById('entry-list').innerHTML = '';

  showAuth('login');
}

// --- Export / import / reset -------------------------------------------------

function setupBackupButtons() {
  const fileInput = document.getElementById('import-file');

  document.getElementById('export-btn').addEventListener('click', () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expense-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-btn').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // lets the same file be chosen again later
    if (!file) return;

    if (!confirm('Importing replaces everything currently saved in this account. Continue?')) return;

    try {
      const count = store.importJson(await file.text());
      resetForm();
      refreshAll();
      alert(`Imported ${count} transaction${count === 1 ? '' : 's'}.`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('Delete ALL transactions from this account? Export a backup first if you want to keep them.')) return;
    store.clear();
    resetForm();
    refreshAll();
  });
}

// --- Summary cards -----------------------------------------------------------

function loadSummary() {
  try {
    const s = store.summary();
    document.getElementById('stat-balance').textContent = formatCurrency(s.balance);
    document.getElementById('stat-income').textContent = formatCurrency(s.monthIncome);
    document.getElementById('stat-expense').textContent = formatCurrency(s.monthExpense);
    document.getElementById('stat-balance').classList.toggle('negative', s.balance < 0);
  } catch (err) {
    console.error('Failed to load summary', err);
  }
}

// --- Transaction list --------------------------------------------------------

function loadTransactions() {
  const list = document.getElementById('entry-list');

  try {
    const data = store.list(50);
    if (data.length === 0) {
      list.innerHTML = '<li class="entry-empty">No entries yet. Add your first transaction above.</li>';
      return;
    }

    list.innerHTML = '';
    data.forEach((tx) => list.appendChild(renderEntryRow(tx)));
  } catch (err) {
    list.innerHTML = `<li class="entry-empty">Could not load transactions: ${escapeHtml(err.message)}</li>`;
  }
}

function renderEntryRow(tx) {
  const li = document.createElement('li');
  li.className = 'entry-row';
  li.dataset.id = tx.id;

  const sign = tx.type === 'income' ? '+' : '−';
  const amountClass = tx.type === 'income' ? 'amount-income' : 'amount-expense';

  li.innerHTML = `
    <div class="entry-date">${formatDate(tx.date)}</div>
    <div class="entry-details">
      <span class="entry-category">${escapeHtml(tx.category)}</span>
      ${tx.note ? `<span class="entry-note">${escapeHtml(tx.note)}</span>` : ''}
    </div>
    <div class="entry-amount ${amountClass}">${sign} ${formatCurrency(tx.amount)}</div>
    <div class="entry-actions">
      <button class="icon-btn" data-action="edit" title="Edit">Edit</button>
      <button class="icon-btn icon-btn-danger" data-action="delete" title="Delete">Delete</button>
    </div>
  `;

  li.querySelector('[data-action="edit"]').addEventListener('click', () => startEdit(tx));
  li.querySelector('[data-action="delete"]').addEventListener('click', () => deleteTransaction(tx.id));

  return li;
}

function deleteTransaction(id) {
  if (!confirm('Delete this transaction? This cannot be undone.')) return;
  try {
    store.remove(id);
    refreshAll();
  } catch (err) {
    alert(`Could not delete: ${err.message}`);
  }
}

// --- Add / edit form -----------------------------------------------------------

function setupForm() {
  const form = document.getElementById('tx-form');
  const typeSelect = document.getElementById('tx-type');
  const categorySelect = document.getElementById('tx-category');
  const cancelBtn = document.getElementById('cancel-edit-btn');

  populateCategories(categorySelect, typeSelect.value);
  document.getElementById('tx-date').valueAsDate = new Date();

  typeSelect.addEventListener('change', () => populateCategories(categorySelect, typeSelect.value));
  cancelBtn.addEventListener('click', resetForm);
  form.addEventListener('submit', handleFormSubmit);
}

function populateCategories(select, type) {
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const current = select.value;
  select.innerHTML = categories.map((c) => `<option value="${c}">${c}</option>`).join('');
  if (categories.includes(current)) select.value = current;
}

function startEdit(tx) {
  state.editingId = tx.id;

  const form = document.getElementById('tx-form');
  form.type.value = tx.type;
  populateCategories(form.category, tx.type);
  form.category.value = tx.category;
  form.amount.value = tx.amount;
  form.date.value = tx.date;
  form.note.value = tx.note || '';

  document.getElementById('form-title').textContent = 'Edit transaction';
  document.getElementById('submit-btn').textContent = 'Save changes';
  document.getElementById('cancel-edit-btn').hidden = false;

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  state.editingId = null;
  const form = document.getElementById('tx-form');
  form.reset();
  form.type.value = 'expense';
  populateCategories(form.category, 'expense');
  document.getElementById('tx-date').valueAsDate = new Date();

  document.getElementById('form-title').textContent = 'Add transaction';
  document.getElementById('submit-btn').textContent = 'Add transaction';
  document.getElementById('cancel-edit-btn').hidden = true;
  clearFormError();
}

function clearFormError() {
  const box = document.getElementById('tx-form-error');
  box.hidden = true;
  box.textContent = '';
}

function handleFormSubmit(event) {
  event.preventDefault();
  clearFormError();

  const form = event.target;
  const payload = {
    type: form.type.value,
    category: form.category.value,
    amount: parseFloat(form.amount.value),
    date: form.date.value,
    note: form.note.value.trim() || null,
  };

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;

  try {
    if (state.editingId) {
      store.update(state.editingId, payload);
    } else {
      store.create(payload);
    }
    resetForm();
    refreshAll();
  } catch (err) {
    const box = document.getElementById('tx-form-error');
    box.textContent = err.message;
    box.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
}

// --- Charts ----------------------------------------------------------------------

const GRID_COLOR = 'rgba(237, 235, 228, 0.08)';
const TICK_COLOR = '#8A9298';

function showChartEmpty(chart, emptyId, isEmpty) {
  document.getElementById(emptyId).hidden = !isEmpty;
  if (isEmpty && chart) chart.destroy();
  return isEmpty ? null : chart;
}

function loadCategoryChart() {
  try {
    const data = store.byCategory('expense');
    categoryChart = showChartEmpty(categoryChart, 'category-chart-empty', data.length === 0);
    if (data.length === 0) return;

    const chartData = {
      labels: data.map((d) => d.category),
      datasets: [{
        data: data.map((d) => d.total),
        backgroundColor: data.map((d) => getCategoryColor(d.category, 'expense')),
        borderColor: '#1B2328',
        borderWidth: 2,
      }],
    };

    if (categoryChart) {
      categoryChart.data = chartData;
      categoryChart.update();
      return;
    }

    categoryChart = new Chart(document.getElementById('category-chart').getContext('2d'), {
      type: 'pie',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#ffffff',
              font: { size: 12 },
              boxWidth: 12,
              padding: 14,
              // Reads the chart's CURRENT data every time, so the percentages
              // stay correct as transactions are added, edited or deleted.
              generateLabels(chart) {
                const dataset = chart.data.datasets[0];
                const shares = percentages(dataset.data);
                return chart.data.labels.map((label, i) => ({
                  text: `${label} (${shares[i].toFixed(1)}%)`,
                  fillStyle: dataset.backgroundColor[i],
                  strokeStyle: dataset.borderColor,
                  fontColor: '#ffffff',
                  hidden: !chart.getDataVisibility(i),
                  index: i,
                }));
              },
            },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const shares = percentages(ctx.dataset.data);
                return `${ctx.label}: ${formatCurrency(ctx.parsed)} (${shares[ctx.dataIndex].toFixed(1)}%)`;
              },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error('Failed to load category chart', err);
  }
}

function loadTrendChart() {
  try {
    // One bar per category: expense categories first, then income categories.
    const rows = store.byCategory();
    trendChart = showChartEmpty(trendChart, 'trend-chart-empty', rows.length === 0);
    if (rows.length === 0) return;

    const expenseRows = rows.filter((r) => r.type === 'expense');
    const incomeRows = rows.filter((r) => r.type === 'income');
    const bars = [...expenseRows, ...incomeRows];

    // A name used by both types (like "Other") gets the type added so the
    // two bars can be told apart.
    const nameCount = {};
    bars.forEach((r) => { nameCount[r.category] = (nameCount[r.category] || 0) + 1; });
    const labels = bars.map((r) => (nameCount[r.category] > 1 ? `${r.category} (${r.type})` : r.category));

    const chartData = {
      labels,
      datasets: [{
        data: bars.map((r) => r.total),
        types: bars.map((r) => r.type), // read by the tooltip
        backgroundColor: bars.map((r) => getCategoryColor(r.category, r.type)),
        borderRadius: 4,
        maxBarThickness: 40,
      }],
    };

    if (trendChart) {
      trendChart.data = chartData;
      trendChart.update();
      return;
    }

    trendChart = new Chart(document.getElementById('trend-chart').getContext('2d'), {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const type = ctx.dataset.types[ctx.dataIndex] === 'income' ? 'Income' : 'Expenses';
                return `${type}: ${formatCurrency(ctx.parsed.y)}`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: TICK_COLOR, font: { size: 11 }, maxRotation: 45 } },
          y: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, font: { size: 11 } } },
        },
      },
    });
  } catch (err) {
    console.error('Failed to load trend chart', err);
  }
}

function loadBalanceLineChart() {
  try {
    // Day-level data (not grouped by month), so the line moves whenever a
    // transaction is added on ANY date.
    const data = store.balanceTrend(30);
    const ctx = document.getElementById('balance-line-chart').getContext('2d');
    const empty = document.getElementById('balance-line-chart-empty');

    if (data.length === 0) {
      empty.hidden = false;
      if (balanceLineChart) {
        balanceLineChart.destroy();
        balanceLineChart = null;
      }
      return;
    }
    empty.hidden = true;

    const balances = data.map((d) => d.balance);

    const chartData = {
      labels: data.map((d) => formatShortDate(d.date)),
      datasets: [{
        label: 'Balance',
        data: balances,
        borderColor: '#3FBF7F',
        backgroundColor: 'rgba(63, 191, 127, 0.15)',
        pointBackgroundColor: balances.map((v) => (v < 0 ? '#9C4A3D' : '#3FBF7F')),
        pointRadius: data.length === 1 ? 5 : 3,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: true,
      }],
    };

    const gridColor = 'rgba(237, 235, 228, 0.08)';
    const textColor = '#8A9298';

    if (balanceLineChart) {
      balanceLineChart.data = chartData;
      balanceLineChart.update();
    } else {
      balanceLineChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label(ctx) {
                  return `Balance: ${formatCurrency(ctx.parsed.y)}`;
                },
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 }, maxRotation: 0, autoSkip: true } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
          },
        },
      });
    }
  } catch (err) {
    console.error('Failed to load balance line chart', err);
  }
}

// --- Formatting helpers ------------------------------------------------------------

function formatCurrency(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value || 0);
}

function formatDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
