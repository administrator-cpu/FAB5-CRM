const { AsyncLocalStorage } = require("async_hooks");

// The request being handled, available anywhere down the call chain, so every log line written while
// handling it can say which route, IP and user it came from without passing req around.
const storage = new AsyncLocalStorage();

const requestContext = (req, res, next) => storage.run({ req }, next);

const currentRequest = () => storage.getStore()?.req;

module.exports = { requestContext, currentRequest };
