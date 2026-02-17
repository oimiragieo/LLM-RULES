function process120(data) {
  // Process function 120
  console.log('Processing:', data);
  return data.map(x => x * 120);
}

class Handler120 {
  constructor() {
    this.id = 120;
  }

  handle(input) {
    return process120([input]);
  }
}
