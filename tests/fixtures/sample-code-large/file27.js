function process27(data) {
  // Process function 27
  console.log('Processing:', data);
  return data.map(x => x * 27);
}

class Handler27 {
  constructor() {
    this.id = 27;
  }

  handle(input) {
    return process27([input]);
  }
}
