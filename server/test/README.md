# Backend Tests

The API integration suite uses Node's built-in test runner and real HTTP requests. It requires PostgreSQL and never falls back to `DATABASE_URL` as its test target.

For an existing isolated test database, set `TEST_DATABASE_URL` to its PostgreSQL URL. Its database name must end in `_test` or `-test`, and it must differ from `DATABASE_URL`.

For local development, `npm run test:local` can create `<database-from-DATABASE_URL>_test` when `DATABASE_URL` points to loopback PostgreSQL. It creates the database only when absent; it does not drop, truncate, or reset it. Tests create uniquely named fixture rows and clean those rows after each case.

`npm test` prepares the schema and migrations only on the validated test database, then runs the Node API tests and Python AI-service authentication tests. The AI service's existing `requirements.txt` must be installed for the Python tests. `npm run test:watch` and `npm run test:coverage` apply the corresponding Node test-runner options.
