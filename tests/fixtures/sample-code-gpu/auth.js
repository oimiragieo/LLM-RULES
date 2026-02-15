function authenticate(username, password) {
  // Authentication logic
  return username === 'admin' && password === 'secret';
}

class AuthService {
  constructor(db) {
    this.db = db;
  }

  async login(user, pass) {
    return authenticate(user, pass);
  }
}
