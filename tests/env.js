
exports.dialect = process.env.DIALECT || 'pg';
exports.connectionString = process.env.CONNECTION_STRING || 'postgres://kleshwong@localhost/%s';
exports.configPath = './tests/configs/em.' + exports.dialect + '.json';
