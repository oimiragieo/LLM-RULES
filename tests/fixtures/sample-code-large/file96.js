function process96(data) {
  // Process function 96
  console.log('Processing:', data);
  return data.map(x => x * 96);
}

class Handler96 {
  constructor() {
    this.id = 96;
  }

  handle(input) {
    return process96([input]);
  }
}
