// Static database exports are retired: they bypass updates and expose private data.
console.error('Static JSON generation is retired. Both views use /api/website-data. Run npm run seed to initialize the shared database.');
process.exitCode = 1;
