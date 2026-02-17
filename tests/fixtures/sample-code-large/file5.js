function process5(data) {
  // Process function 5
  console.log('Processing:', data);
  return data.map(x => x * 5);
}

class Handler5 {
  constructor() {
    this.id = 5;
  }

  handle(input) {
    return process5([input]);
  }
}
