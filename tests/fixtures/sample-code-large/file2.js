
function process2(data) {
  // Process function 2
  console.log('Processing:', data);
  return data.map(x => x * 2);
}

class Handler2 {
  constructor() {
    this.id = 2;
  }

  handle(input) {
    return process2([input]);
  }
}
          