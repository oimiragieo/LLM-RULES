
function process1(data) {
  // Process function 1
  console.log('Processing:', data);
  return data.map(x => x * 1);
}

class Handler1 {
  constructor() {
    this.id = 1;
  }

  handle(input) {
    return process1([input]);
  }
}
          