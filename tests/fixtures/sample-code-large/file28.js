function process28(data) {
  // Process function 28
  console.log('Processing:', data);
  return data.map(x => x * 28);
}

class Handler28 {
  constructor() {
    this.id = 28;
  }

  handle(input) {
    return process28([input]);
  }
}
