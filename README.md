# Biko Jobs

A progressive web app for managing bike workshop jobs.

## Development

To run a development server on localhost:

1. Check out the repo
2. `npm ci`
3. `npm dev`

The development server runs with an in-memory database, so when the API service restarts, all data is lost. To populate some dummy data, run

`node app/test/data/populate.ts`

This populates some data in the session `some-session` with password `some-password`.
