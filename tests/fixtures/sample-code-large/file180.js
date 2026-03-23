function process180(data) {
  // Process function 180
  console.log('Processing:', data);
  return data.map(x => x * 180);
}

class Handler180 {
  constructor() {
    this.id = 180;
  }

  handle(input) {
    return process180([input]);
  }
}
