function authenticate(username, password) {
  const user = db.query('SELECT * FROM users WHERE username = ?', [username]);
  return user && user.password === password;
}