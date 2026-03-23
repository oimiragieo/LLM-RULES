
function process3(data) {
  // Process function 3
  console.log('Processing:', data);
  return data.map(x => x * 3);
}

class Handler3 {
  constructor() {
    this.id = 3;
  }

  handle(input) {
    return process3([input]);
  }
}
          