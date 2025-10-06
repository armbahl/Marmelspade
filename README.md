# Marmelspade
### How to use:
1. Make sure you have [Node.js](https://nodejs.org/en/download) and [Meilisearch](https://www.meilisearch.com/docs/learn/self_hosted/getting_started_with_self_hosted_meilisearch) installed on your machine.
2. Open "config.json," input the inventory paths you would like to pull from, and set the server info so that it matches your Meilisearch settings.
3. Start your Meilisearch instance with the same master key as set in config.json.
4. In your terminal, navigate to the directory with "config.json" and run the following commands in order:
    * `npm install`
      * First run only.
    * `npm run pull`
      * Only needed for first run or when entries need to be updated.
    * `npm run start`
      * Starts the Nodejs server.


You can now connect to your frontend and start searching!
## Licenses
* Marmelspade
  * [MIT LICENSE](https://github.com/armbahl/Marmelspade/blob/main/)
* Node.js
  * https://github.com/nodejs/node/blob/HEAD/LICENSE
* Meilisearch
  * https://github.com/meilisearch/meilisearch/blob/main/LICENSE
