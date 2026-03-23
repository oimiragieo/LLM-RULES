function process38(data) {
  // Process function 38
  console.log('Processing:', data);
  return data.map(x => x * 38);
}

class Handler38 {
  constructor() {
    this.id = 38;
  }

  handle(input) {
    return process38([input]);
  }
}
