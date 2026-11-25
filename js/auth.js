// js/auth.js
// Local accounts for people who share one browser/PC. Everything stays on this
// device — there is no server and no email.
//
// What this IS: a way to keep several people's transactions separate and to
// know who is signed in. Passwords are salted and hashed (PBKDF2), never stored
// in plain text.
// What this is NOT: encryption. Anyone with full access to this browser's files
// or dev tools could still read the saved data. Treat it like a household
// "who's using the app" switch, not a bank vault.

const USERS_KEY = 'expense-tracker.users.v1';
const SESSION_KEY = 'expense-tracker.session.v1';
const PBKDF2_ITERATIONS = 150000;

const auth = (() => {
  let memoryUsers = {};     // used only when browser storage is blocked
  let memorySession = null;

  // --- Account list ----------------------------------------------------------
  function readUsers() {
    if (!store.persistent) return memoryUsers;
    try {
      const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeUsers(users) {
    if (!store.persistent) {
      memoryUsers = users;
      return;
    }
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (e) {
      throw new Error('Could not save the account. Browser storage may be full or blocked.');
    }
  }

  // --- Session (who is signed in) --------------------------------------------
  // "Keep me signed in" uses localStorage (survives closing the browser).
  // Otherwise sessionStorage is used (ends when the tab/browser is closed).
  function readSession() {
    if (!store.persistent) return memorySession;
    try {
      return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    } catch (e) {
      return null;
    }
  }

  function writeSession(key, remember) {
    if (!store.persistent) {
      memorySession = key;
      return;
    }
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      if (key) (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, key);
    } catch (e) {
      /* a failed session write just means they'll log in again next time */
    }
  }

  // --- Password hashing ------------------------------------------------------
  const toHex = (buf) =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

  async function hashPassword(password, saltHex) {
    if (!(window.crypto && window.crypto.subtle)) {
      throw new Error('This page cannot protect passwords in your browser. Open it over https:// or http://localhost and try again.');
    }
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS },
      material,
      256
    );
    return toHex(bits);
  }

  // --- Validation ------------------------------------------------------------
  function cleanUsername(raw) {
    const username = String(raw || '').trim();
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) {
      throw new Error('Username must be 3–30 characters: letters, numbers, dot, dash or underscore.');
    }
    return username;
  }

  function checkPassword(password) {
    if (typeof password !== 'string' || password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    if (password.length > 200) throw new Error('Password is too long.');
  }

  const keyOf = (username) => username.toLowerCase();

  return {
    hasUsers: () => Object.keys(readUsers()).length > 0,

    userExists: (username) => Object.prototype.hasOwnProperty.call(readUsers(), keyOf(String(username).trim())),

    // Returns { key, username } for whoever is signed in, or null.
    currentUser() {
      const key = readSession();
      const user = key && readUsers()[key];
      return user ? { key, username: user.username } : null;
    },

    async register(rawUsername, password, remember) {
      const username = cleanUsername(rawUsername);
      checkPassword(password);

      const users = readUsers();
      const key = keyOf(username);
      if (Object.prototype.hasOwnProperty.call(users, key)) {
        throw new Error('That username is already taken on this device.');
      }

      const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
      users[key] = {
        username,
        salt,
        hash: await hashPassword(password, salt),
        createdAt: new Date().toISOString(),
      };
      writeUsers(users);

      writeSession(key, remember);
      return { key, username };
    },

    async login(rawUsername, password, remember) {
      const users = readUsers();
      const key = keyOf(String(rawUsername || '').trim());
      const user = Object.prototype.hasOwnProperty.call(users, key) ? users[key] : null;

      // Same message for "no such user" and "wrong password".
      const fail = () => new Error('Incorrect username or password.');
      if (!user) throw fail();
      if ((await hashPassword(String(password || ''), user.salt)) !== user.hash) throw fail();

      writeSession(key, remember);
      return { key, username: user.username };
    },

    logout() {
      writeSession(null);
    },

    // Removes the account AND its saved transactions from this browser.
    deleteAccount(rawUsername) {
      const users = readUsers();
      const key = keyOf(String(rawUsername || '').trim());
      if (!Object.prototype.hasOwnProperty.call(users, key)) return false;
      delete users[key];
      writeUsers(users);
      store.deleteUserData(key);
      if (readSession() === key) writeSession(null);
      return true;
    },
  };
})();
