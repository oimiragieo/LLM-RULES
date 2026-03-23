function process37(data) {
  // Process function 37
  console.log('Processing:', data);
  return data.map(x => x * 37);
}

class Handler37 {
  constructor() {
    this.id = 37;
  }

  handle(input) {
    return process37([input]);
  }
}
