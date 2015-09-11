
function Database(em, connection, release) {
  this.em = em;
  this.agent = em.agent;
  this.definition = em.normalized;
  this.connection = connection;
  this.release = release;
}

Database.prototype.query = function(sqlScript, sqlParams) {
  return this.agent.query(this.connection, sqlScript, sqlParams);
};

Database.prototype.createDatabase = function(databaseName) {
  return this.query(this.agent.createDatabase(databaseName));
};

Database.prototype.dropDatabase = function(databaseName) {
  return this.query(this.agent.dropDatabase(databaseName));
};
