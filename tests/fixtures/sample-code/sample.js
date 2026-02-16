
function hello(name) {
  // This is a greeting function that logs a personalized hello message
  const message = "Hello, " + name + "! Welcome to the code indexing system.";
  console.log(message);
  return message;
}

class Greeter {
  constructor(defaultName) {
    this.defaultName = defaultName || 'World';
  }

  greet(name) {
    // Greet with provided name or default
    const actualName = name || this.defaultName;
    return 'Hi, ' + actualName + '! Nice to meet you.';
  }
}
      