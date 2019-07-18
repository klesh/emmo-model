
exports.dialect = process.env.DIALECT || 'pg';
exports.connectionString = process.env.CONNECTION_STRING || '/var/run/postgresql %s';
exports.configPath = './tests/configs/em.' + exports.dialect + '.json';
