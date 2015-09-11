var Promise = require('bluebird');

var array = [3, 2, 1];

Promise.each(array, function(n) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      console.log(n + Date());
      resolve(n);
    }, n * 1000);
  });
});
