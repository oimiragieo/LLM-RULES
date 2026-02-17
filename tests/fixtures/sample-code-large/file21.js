function process21(data) {
  // Process function 21
  console.log('Processing:', data);
  return data.map(x => x * 21);
}

class Handler21 {
  constructor() {
    this.id = 21;
  }

  handle(input) {
    return process21([input]);
  }
}
