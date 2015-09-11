var QueryBuilder = require('../lib/query-builder.js');

describe('QueryBulider Test', function() {
  it('insert', function() {
    var queryBuilder = new QueryBuilder('pg', require('./case-norm-definition/output.json'));
    var result = queryBuilder.insert('User', { nick: 'klesh', isAdmin: true, email: 'klesh@qq.com' });
    console.log(result.sql);
    console.log(result.params);
  });
});
