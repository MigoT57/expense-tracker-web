# Ledger — Expense Tracker

A simple expense tracker that runs in your web browser. You can record your income and expenses and see where your money goes, with no installation needed.

**Try it here:** https://migot57.github.io/expense-tracker-web/

## Features

- Create an account with a username and password (no email needed) and log out
- Add, edit, and delete income and expenses
- Dashboard showing your balance, monthly income, and monthly spending
- Charts for spending by category, income vs. expenses, and balance trend
- Export your data as a backup file and import it back later
- Works on both phone and computer

## How to use

1. Open the link above.
2. Create an account (the first time) or log in.
3. Add your income and expenses using the form.
4. Check the dashboard and charts to see your spending.
5. Click **Export** once in a while to save a backup of your data.

## Important notes

- Your data is saved **only in your own browser**. Nothing is uploaded to any server.
- Each account has its own separate data, so people sharing one computer won't see each other's entries.
- The login keeps accounts separate, but it is **not encryption**, so don't treat it as a secure vault.
- If you forget your password, it **can't be recovered**. Use "Forgot password?" on the login page to delete that account and start again.
- Data does not sync between devices or browsers, and clearing your browser data will erase it. This is why the **Export** button is useful.

## Run it on your computer

1. Click **Code → Download ZIP** on this page and unzip it.
2. Double-click `index.html` to open it in your browser.

## Project files

```
index.html        Main page
css/style.css     Styling
js/auth.js        Accounts (sign up, log in, log out)
js/storage.js     Saves each account's data in the browser
js/app.js         Dashboard, form, and charts
js/vendor/        Chart.js library
```

## Built with

HTML, CSS, and JavaScript, with [Chart.js](https://www.chartjs.org/) for the charts.

---

Developed by MigoT57
