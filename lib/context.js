
function Context(agent, connection) {
  this.agent = agent;
  this.connection = connection;
}

Context.prototype.query = function() {
  return this.agent.query(this.connection);
};
