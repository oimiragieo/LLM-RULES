function process25(data) {
  // Process function 25
  console.log('Processing:', data);
  return data.map(x => x * 25);
}

class Handler25 {
  constructor() {
    this.id = 25;
  }

  handle(input) {
    return process25([input]);
  }
}
