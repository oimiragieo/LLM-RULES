function process60(data) {
  // Process function 60
  console.log('Processing:', data);
  return data.map(x => x * 60);
}

class Handler60 {
  constructor() {
    this.id = 60;
  }

  handle(input) {
    return process60([input]);
  }
}
