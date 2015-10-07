# emmo-model v1.0.0
a lightweight orm framework, supports shadowing databases.

## INSTALLATION

Install emmo-model-cli to help you generate necessary files
```bash
$ sudo npm install emmo-model-cli -g
```

Enter your project folder and install emmo-model

```bash
$ cd myproject
$ npm install emmo-model --save
$ em init
```
That would create `em.json` file, `models/` and `migrations/` folders in myproject/

## Usage

### define model

myproject/models/user.js
```js
var em = require('emmo-model');

module.exports = em.define('User', {
  id: { type: 'bigint', autoIncrement: true, primaryKey: true }, // bigserial(postgres)
  account: { type: 'string', length: 50, allowNull: false, unique: true }, // varchar(50)
  firstName: { type: 'string', length: 50 },
  lastName: { type: 'string', length: 50 },
  roleId: { type: 'int', refer: 'Role', onDelete: 'CASCADE' }
  remark: { type: 'string' }, // text
  createdAt: { type: 'timestamptz', defaultValue: 'now()' } // timestamptz
}, {
  getFullName: function() {
    return this.firstName + ' ' + this.lastName;
  }
});
```
myproject/models/role.js
```js
var em = require('emmo-model');

module.exports = em.define('Role', {
  id: { type: 'int', autoIncrement: true, primaryKey: true },
  name: { type: 'string', length: 50, allowNull: false }
})
```

### bootstrap
modify myproject/bin/www to bootstrap emmo-model before server start.
```js
var em = require('emmo-model');
em.createOrMigrate().then(function() {
  server.listen(4000);
});
```

### CRUD
myproject/routes/index.js
```js
var em = require('emmo-model');
var _ = require('lodash');

route.get('/', function(req, res) {
  em.scope(function(db) {
    return db.select('User', { 
      where: { RoleId: [ '<', 100 ] }, 
      order: { id : 'DESC' },
      skip: 100,
      limit: 10
    })
  }).then(function(users) {
    res.json(users);
  })
});

route.post('/', function(req, res) {
  em.scope(function(db) {
    return db.insert('User', req.body);
  }).then(function(user) {
    res.json({ insertedId: user.id });
  });
});

route.put('/:id', function(req, res) {
  em.scope(function(db) {
    return db.update('User', req.body);
  }).then(function(affectedRows) {
    res.json({ updatedFields: _.keys(req.body) });
  });
});

route.delete('/:id', function(req, res) {
  em.scope(function(db) {
    return db.delete('User', { id: req.params.id });
  }).then(function(affectedRows) {
    res.json({ affectedRows: affectedRows });
  });
});
```

## EmmoModel
A EmmoModel instance represent a set of Models. The major difference to other orm framework is that EmmoModel supports multiple databases sharing same set of Models.

### define(modelName, columnsDef, methodsDef) -> constructor
Define a new Model

### createOrMigrate() -> Promise
Create and initial database if it doesn't exists
```js
em.createOrMigrate().then(function(isCreate) {
  if (isCreate) {
    em.scope(function(session) {
      // to insert initial data, like admin user..
    })
  }
})
```

### scope([databaseName], cb) -> Promise
Accept a callback function which must returns a Promise(bluebird) object contains database operations.
Scope will attach a function to release database connection and return result to further actions.
```js
em.scope(function(session) {
  return session.find('User', { id: 1 })
    .then(function(user) {
      user.remark = 'new remark';
      return session.update('User', user);
    })
}).then(function() {
  console.log('User is updated successfully and connection was release.');
})
```

### create(databaseName) -> Promise
Create an empty database.

### remove(databaseName) -> Promise
Remove database.

### initial(databaseName) -> Promise
Run initial sql script on database to build up tables/indexes/foreignkeys according to Models definition.

### migrate(databaseName) -> Promise
Run pending migrations, executed migrations will be ignored.

### spawn(options)
Create new EmmoModel instance with same models definition as current one.
Useful when you working with different data server.

## Session
Represent a database connection, to perform database CRUD operations.

### find(modelName, where)
Shorthand to selectOne which _where_ indicates one row only.
```js
em.scope(function(db) {
  return db.find('User', { id: 1 });
}).then(function(user) {
  console.log(user);
})
```

### select(modelName, options)
Return multiple model rows.
```js
em.scope(function(db) {
  return db.select('User', { where: { roleId: [ 'in', [1, 2, 3] ] } });
}).then(function(users) {
  console.log(users);
})
```

### selectOne(modelName, options)
Return only the first row.
```js
em.scope(function(db) {
  return db.select('User', { where: { roleId: [ 'in', [1, 2, 3] ] } });
}).then(function(user) {
  console.log(user);
})
```

### scalar(modelName, options)
Return the first cell value of first row.
```js
em.scope(function(db) {
  return db.scalar('User', { field: 'id', where: { id: 1 } });
}).then(function(userId) {
  console.log(userId);
})
```

### insert(modelName, data)
Insert a new row into table
```js
var user = { account: 'admin', firstName: 'Klesh', lastName: 'Wong' };

em.scope(function(db) {
  return db.insert('User', user);
}).then(function(insertedUser) {
  console.log(user.id); // 1
  console.log(insertedUser.id); // 1
  console.log(user === insertedUser); // true
})
```

### update(modelName, data, [where])
Update model base on data's keys, 
```js
// database user: { id: 1, firstName: 'Klesh', lastName: 'Wong' }
em.scope(function(db) {
  return db.update('User', { id: 1, firstName: 'Johnny' });
}).then(function() {
  return db.find('User', { id: 1 });
}).then(function(user) {
  console.log(user.firstName); // 'Johhny'
  console.log(user.lastName); // 'Wong'
})
```
Pass where to perform batch update.
```js
em.scope(function(db) {
  return db.update('User', { firstName: 'Johnny' }, { id: [ 'in', [1, 2, 3] ] });
}).then(function(affectedRows) {
  console.log(affectedRows); // 3
})

```

## Migration

Enter your project folder which had emmo-model installed then you can generate migration file
```base
$ cd myproject
$ em migrate MIGRATION_NAME
```
That will create a migration sql script file in myproject/migrations.
All migrations will be executed smartly by invoking createOrMigrate().

## Notice
This is a very immature framework, pull requests and suggestion are gratefully welcome.
