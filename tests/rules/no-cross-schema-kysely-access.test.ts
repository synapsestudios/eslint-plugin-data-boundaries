const { RuleTester } = require('eslint');
const rule = require('../../dist/rules/no-cross-schema-kysely-access');

const ruleTester = new RuleTester({
  languageOptions: {
    parser: require('@typescript-eslint/parser'),
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

const WORKERS_MIGRATION = '/app/src/modules/workers/migrations/20261027191334_create_workers.ts';
const WORKERS_REPOSITORY = '/app/src/modules/workers/infrastructure/worker.repository.ts';

const TABLE_METHODS = [
  'selectFrom',
  'insertInto',
  'replaceInto',
  'updateTable',
  'deleteFrom',
  'mergeInto',
  'innerJoin',
  'leftJoin',
  'rightJoin',
  'fullJoin',
  'crossJoin',
  'innerJoinLateral',
  'leftJoinLateral',
  'crossJoinLateral',
  'using',
];

describe('no-cross-schema-kysely-access', () => {
  ruleTester.run('no-cross-schema-kysely-access', rule, {
    valid: [
      {
        name: "withSchema naming the module's own schema",
        filename: WORKERS_REPOSITORY,
        code: `this.db = database.withTables<WorkerTables>().withSchema('workers');`,
      },
      {
        name: "a migration using the module's own schema",
        filename: WORKERS_MIGRATION,
        code: `await db.schema.withSchema('workers').createTable('workers').execute();`,
      },
      {
        name: 'a table name without a schema, which withSchema scopes',
        filename: WORKERS_REPOSITORY,
        code: `await this.db.selectFrom('workers').selectAll().execute();`,
      },
      {
        name: "a table in the module's own schema",
        filename: WORKERS_REPOSITORY,
        code: `await this.db.selectFrom('workers.workers').selectAll().execute();`,
      },
      {
        name: 'raw sql without tables',
        filename: WORKERS_MIGRATION,
        code: `
          col.notNull().defaultTo(sql\`now()\`);
          builder.addCheckConstraint('workers_external_id_check', sql\`(source is null) = (source_key is null)\`);
        `,
      },
      {
        name: "raw sql naming a table in the module's own schema",
        filename: WORKERS_REPOSITORY,
        code: `await sql\`select count(*) from workers.workers\`.execute(this.db);`,
      },
      {
        name: 'a file outside the modules',
        filename: '/app/src/database/migrations/migrator.ts',
        code: `await db.schema.withSchema('scheduling').createTable('shifts').execute();`,
      },
    ],
    invalid: [
      {
        name: "withSchema naming another module's schema",
        filename: WORKERS_REPOSITORY,
        code: `this.db = database.withTables<SchedulingTables>().withSchema('scheduling');`,
        errors: [
          {
            messageId: 'foreignSchema',
            data: { currentModule: 'workers', schema: 'scheduling' },
          },
        ],
      },
      {
        name: "a migration using another module's schema",
        filename: WORKERS_MIGRATION,
        code: `await db.schema.withSchema('scheduling').dropTable('shifts').execute();`,
        errors: [
          {
            messageId: 'foreignSchema',
            data: { currentModule: 'workers', schema: 'scheduling' },
          },
        ],
      },
      {
        name: 'withSchema with a schema that is not a string literal',
        filename: WORKERS_REPOSITORY,
        code: `this.db = database.withTables<WorkerTables>().withSchema(schemaName);`,
        errors: [{ messageId: 'nonLiteralSchema', data: { currentModule: 'workers' } }],
      },
      ...TABLE_METHODS.map((method) => ({
        name: `${method} a table in another module's schema`,
        filename: WORKERS_REPOSITORY,
        code: `this.db.${method}('scheduling.shifts');`,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: { currentModule: 'workers', schema: 'scheduling', table: 'shifts' },
          },
        ],
      })),
      {
        name: "an aliased table in another module's schema",
        filename: WORKERS_REPOSITORY,
        code: `this.db.selectFrom('workers.workers as w').innerJoin('scheduling.shifts as s', 's.worker_id', 'w.id');`,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: { currentModule: 'workers', schema: 'scheduling', table: 'shifts' },
          },
        ],
      },
      {
        name: "an array of tables with one in another module's schema",
        filename: WORKERS_REPOSITORY,
        code: `this.db.selectFrom(['workers.workers', 'scheduling.shifts']);`,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: { currentModule: 'workers', schema: 'scheduling', table: 'shifts' },
          },
        ],
      },
      {
        name: "raw sql naming a table in another module's schema",
        filename: WORKERS_REPOSITORY,
        code: `await sql\`select * from scheduling.shifts\`.execute(this.db);`,
        errors: [
          {
            messageId: 'crossSchemaAccess',
            data: { currentModule: 'workers', schema: 'scheduling', table: 'shifts' },
          },
        ],
      },
      {
        name: 'raw sql naming a table without a schema, which withSchema does not scope',
        filename: WORKERS_REPOSITORY,
        code: `await sql\`select * from workers\`.execute(this.db);`,
        errors: [
          { messageId: 'unqualifiedTable', data: { currentModule: 'workers', table: 'workers' } },
        ],
      },
    ],
  });
});
