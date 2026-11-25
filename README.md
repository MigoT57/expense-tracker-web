# Ledger — Expense Tracker

A simple expense tracker that runs entirely in your browser. No sign-up, no server, no install.

**Live demo:** https://YOUR-USERNAME.github.io/expense-tracker/

## Features

- Simple local accounts (username + password, no email) with log out, so several people can share one computer and keep their entries separate
- Add, edit, and delete income and expense transactions
- Dashboard with balance, monthly income, and monthly spending
- Charts: spending by category, income vs. expenses, and balance trend
- Export your data to a JSON file and import it back (backup / move to another device)
- Works on desktop and mobile

## Accounts and your data

Accounts are stored in your browser, on your own device. There is no server and no email, and nothing is uploaded anywhere.

- The first time you open the app you create an account. After that you log in with your username and password.
- Each account has its own separate transactions, so people sharing a computer don't see each other's entries.
- Passwords are salted and hashed (PBKDF2) before being saved, never stored as plain text.
- **This is not encryption.** The login keeps accounts separate and shows who is using the app. Someone with full access to the browser's files or developer tools could still read the saved data.
- **Passwords can't be recovered**, because there is no email. If you forget one, use **Forgot password?** on the login screen to delete that account and its data, then create it again.
- Data does **not** sync between devices or browsers, and clearing your browser data erases it.
- Use **Export** regularly to back up the current account to a JSON file, and **Import** to restore it.

## Run it locally

No build step. Either open `index.html` in your browser, or serve the folder:

```bash
python -m http.server 8080
```

then visit http://localhost:8080.

## Host it free on GitHub Pages

1. Push this project to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose branch **main** and folder **/ (root)**, then click **Save**.
5. Wait a minute or two. Your site will be live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

## Project structure

```
index.html        The app page
css/style.css     Styles
js/auth.js        Local accounts: sign up, log in, log out
js/storage.js     Saves and calculates each account's data in the browser
js/app.js         Dashboard, form, and charts
js/vendor/        Chart.js (bundled, works offline)
```

## Tech

Plain HTML, CSS, and JavaScript. Charts by [Chart.js](https://www.chartjs.org/). No frameworks or build tools.

## License

MIT
