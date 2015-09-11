
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

Database.prototype.insert = function(modelName, data) {

};
