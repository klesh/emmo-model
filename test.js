
function Foo() {

}

Foo.prototype.sayHi = function() {
  console.log('hi');
};

var foo = new Foo();
foo.sayHi = function() {
  console.log('hello');
};
foo.sayHi();
